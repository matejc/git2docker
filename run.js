const auth = require('basic-auth');
const bcrypt = require('bcryptjs');
const pushover = require('pushover');
const spawn = require('child_process').spawn;
const exec = require('child_process').exec;
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const readline = require('readline');

const options = require(process.env.OPTIONS_FILE || './options.json');
const repos = pushover(options.repos);
const repositories = process.env.REPOSITORIES ? JSON.parse(process.env.REPOSITORIES) : require(process.env.REPOSITORIES_FILE || './repositories.json');

options.port = process.env.PORT || options.port;
options.username = process.env.USERNAME || options.username;
options.password = process.env.PASSWORD || options.password;


function execCmd(cmds, logStream) {
    return new Promise(function(resolve) {
        let cmd = options.cmdPrefix + ' bash -c "' + cmds.join(' && ') + '"';
        let proc = exec(cmd);

        proc.stdout.setEncoding('utf8');
        proc.stdout
            .pipe(logStream, {end: false});

        proc.stderr.setEncoding('utf8');
        proc.stderr
            .pipe(logStream, {end: false});

        proc.on('exit', function (code) {
            console.info(cmd+': '+code+'\n\n');
            logStream.write('build exit code: '+code+'\n\n');
            resolve();
        });
    });
}

repos.on('push', function (push) {
    let script = path.join(__dirname, 'build.sh');
    let exists = fs.existsSync(script);
    if (!exists || !repositories[push.repo]) {
        console.info('push reject ' + push.repo + '/' + push.commit + ' (' + push.branch + ')');
        return push.reject();
    }

    let cwd = fs.existsSync(push.cwd) && push.cwd;
    cwd = cwd || fs.existsSync(push.cwd+'.git') && (push.cwd+'.git');

    console.info('push ' + push.repo + '/' + push.commit + ' (' + push.branch + ') cwd:' + cwd);

    let logStream = new stream.PassThrough();

    const rl = readline.createInterface({
        input: logStream,
        crlfDelay: Infinity
    });

    push.on('response', function(response) {
        rl.on('line', (line) => {
            if (line && line.length != 0) {
                line = `${('000' + ((line.length+6).toString(16))).slice(-4)}\x02${line}\n`;
                response.queue(line);
            }
        });
        rl.on('close', function() {
            response.queue('0000');
            response.queue(null);
        });
    });

    push.on('exit', function(code) {
        console.info('push code:', code);
        if (code !== 0) {
            return;
        }

        let registry = {};
        let spawnEnv = Object.create(process.env);
        if (repositories[push.repo].registry) {
            registry = repositories[push.repo].registry;
            spawnEnv.REGISTRY_USERNAME = registry.username || '';
            spawnEnv.REGISTRY_PASSWORD = registry.password || '';
        }

        console.info(`spawn: ${script} ${push.repo} ${push.commit} ${push.branch} ${registry.host || ''}; cwd: ${cwd}`);

        let proc = spawn(script, [push.repo, push.commit, push.branch, registry.host || ''], {cwd: cwd, env: spawnEnv});

        // proc.stdout.setEncoding('utf8');
        proc.stdout
            .pipe(logStream, {end: false});

        // proc.stderr.setEncoding('utf8');
        proc.stderr
            .pipe(logStream, {end: false});

        proc.on('exit', function (code) {
            console.info(`${script} exited with ${code}`);
            logStream.write(`Build exited with ${code}`);
            if (repositories[push.repo].cmd) {
                execCmd(repositories[push.repo].cmd, logStream)
                    .then(function() {
                        logStream.end();
                    })
                    .catch(function(err) {
                        console.error(err);
                    });
            } else {
                logStream.end();
            }
        });
    });

    push.accept();
});

bcrypt.genSalt(3, function(err, salt) {
    bcrypt.hash(options.password, salt, function(err, hash) {
        options.hash = hash;
    });
});

let http = require('http');
let server = http.createServer(function (req, res) {
    console.info(new Date(), req.method, req.url);
    let credentials = auth(req);

    new Promise(function(resolve, reject) {
        if (!credentials || credentials.name !== options.username || !credentials.pass) {
            return reject();
        }
        bcrypt.compare(credentials.pass, options.hash, function(err, ok) {
            if(!err && ok){
                resolve();
            }else{
                reject(err);
            }
        });
    })
        .then(function() {
            repos.handle(req, res);
        })
        .catch(function(err) {
            if (err) {
                console.error(err);
                res.statusCode = 500;
                res.end(err.message || 'Internal Server Error');
            } else {
                res.statusCode = 401;
                res.setHeader('WWW-Authenticate', 'Basic realm="Enter credentials"');
                res.end('Access denied');
            }
        });
});

server.listen(options.port);
