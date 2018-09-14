#!/usr/bin/env bash

set -e

NAME="$1"
COMMIT="$2"
REV="$3"
REGISTRY="$4"
REPO="$PWD"
SRC="$REPO-$COMMIT-src"

echo $NAME $COMMIT $REPO $SRC

err_handler() {
    echo "$NAME: Error on line $1 in file $0"
}

trap 'err_handler $LINENO' ERR

test -n "$NAME"
test -n "$COMMIT"
test -n "$REPO"
test -n "$REV"

rm -rf "$SRC"
git clone $REPO "$SRC"

cd "$SRC"

git checkout "$COMMIT"

TAGS="--tag=$NAME:$REV"

test -z "$REGISTRY" || {
    TAGS="$TAGS --tag=$REGISTRY/$NAME:$REV";
}

docker build $TAGS "$SRC"

if [[ -z "$REGISTRY" ]]
then
    echo "Deployed to local $NAME at `date`, tags: $NAME:$REV";
else
    if [[ -n "$REGISTRY_USERNAME" ]]
    then
        echo "$REGISTRY_PASSWORD" | docker login -u "$REGISTRY_USERNAME" --password-stdin "$REGISTRY"
    fi
    docker push $REGISTRY/$NAME:$REV;
    echo "Deployed to registry $NAME at `date`, tags: $REGISTRY/$NAME:$REV";
fi
