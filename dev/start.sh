#!/bin/sh

if [ ! -d /app/node_modules ]
then
	npm install
fi
grunt