FROM node:10-slim

RUN apt-get update && \
  apt-get install -y git iptables init-system-helpers libltdl7 && \
  rm -rf /var/lib/apt/lists/*

ARG DOCKER_PKG="docker-ce_18.06.1~ce~3-0~debian_amd64.deb"

RUN curl -o/tmp/docker.deb https://download.docker.com/linux/debian/dists/jessie/pool/stable/amd64/${DOCKER_PKG} && \
  dpkg -i /tmp/docker.deb && rm /tmp/docker.deb

RUN mkdir -p /opt/var/logs && chown -R node:node /opt
WORKDIR /opt

ADD package.json .

RUN npm install

ADD build.sh .
ADD run.js .

ENV OPTIONS_FILE="/opt/var/config/options.json"
ENV REPOSITORIES_FILE="/opt/var/config/repositories.json"

ENTRYPOINT [ "npm", "run", "start" ]
