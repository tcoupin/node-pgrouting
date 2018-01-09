#!/bin/sh

if ! command -v grunt
then
	npm install -g grunt-cli
fi
if [ ! -d /app/node_modules ]
then
	npm install
fi
grunt
