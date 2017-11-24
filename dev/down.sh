#!/bin/bash

source $(dirname $0)/env.psql

function dc(){
	docker-compose -p pgr -f $(dirname $0)/docker-compose.yml "$@"
}

dc exec node rm -r /app/node_modules

dc down -v
docker image rm pgr_node