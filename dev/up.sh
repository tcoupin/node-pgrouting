#!/bin/bash

source $(dirname $0)/env.psql

function dc(){
	docker-compose -p pgr -f $(dirname $0)/docker-compose.yml "$@"
}

dc up -d

status=1
while [ "$status" != "0" ]
do
    sleep 1
    dc logs postgres | grep "ready for start up"
    status=$?
done


dc exec -u 999 postgres psql $POSTGRES_DB -c "CREATE EXTENSION IF NOT EXISTS postgis;"
dc exec -u 999 postgres psql $POSTGRES_DB -c "CREATE EXTENSION IF NOT EXISTS pgrouting;"

echo "==Import data=="
dc exec node npm install geojson2pgsql
dc exec node ./node_modules/.bin/geojson2pgsql dev/data/route120_IGN-F/route.geojson route

echo "==Create topology=="

read -d '' sql_request << ENDSQL


drop table if exists edge;
drop table if exists edge_vertices_pgr;

select ogc_fid as id,
(CASE WHEN num_route is null THEN null ELSE num_route || (case WHEN res_europe is not null then '/' || res_europe else '' END) END) as name,
null::integer as source,
null::integer as target,
(case
	WHEN r.sens in ('Double sens', 'Sens unique')
	THEN ST_LengthSpheroid( r.wkb_geometry,
			  'SPHEROID["GRS_1980",6378137,298.257222101]' )
	ELSE -1.0
END) as cost_distance,
(case
	WHEN r.sens in ('Double sens', 'Sens inverse')
	THEN ST_LengthSpheroid( r.wkb_geometry,
			  'SPHEROID["GRS_1980",6378137,298.257222101]' )
	ELSE -1.0
END) as reverse_cost_distance,
(case
	WHEN r.sens in ('Double sens', 'Sens unique')
	THEN 3.6*ST_LengthSpheroid( r.wkb_geometry,
			  'SPHEROID["GRS_1980",6378137,298.257222101]' )/(
		CASE WHEN vocation = 'Type autoroutier' THEN 120.0
		WHEN vocation = 'Liaison régionale' THEN 90.0
		WHEN vocation = 'Liaison principale' THEN 70.0
		WHEN vocation = 'Liaison locale' THEN 50.0
		ELSE 30.0
		END
	)
	ELSE -1.0
END) as cost_duration,
(case
	WHEN r.sens in ('Double sens', 'Sens inverse')
	THEN 3.6*ST_LengthSpheroid( r.wkb_geometry,
			  'SPHEROID["GRS_1980",6378137,298.257222101]' )/(
		CASE WHEN vocation = 'Type autoroutier' THEN 120.0
		WHEN vocation = 'Liaison régionale' THEN 90.0
		WHEN vocation = 'Liaison principale' THEN 70.0
		WHEN vocation = 'Liaison locale' THEN 50.0
		ELSE 30.0
		END
	)
	ELSE -1.0
END) as reverse_cost_duration,
(case
	WHEN r.sens in ('Double sens', 'Sens unique')
	THEN ST_LengthSpheroid( r.wkb_geometry,
			  'SPHEROID["GRS_1980",6378137,298.257222101]' )*(
		CASE WHEN vocation = 'Type autoroutier' THEN 9
		WHEN vocation = 'Liaison régionale' THEN 7
		WHEN vocation = 'Liaison principale' THEN 6
		WHEN vocation = 'Liaison locale' THEN 7
		ELSE 8
		END
	)/100000
	ELSE -1.0
END) as cost_consumption,
(case
	WHEN r.sens in ('Double sens', 'Sens inverse')
	THEN ST_LengthSpheroid( r.wkb_geometry,
			  'SPHEROID["GRS_1980",6378137,298.257222101]' )*(
		CASE WHEN vocation = 'Type autoroutier' THEN 9
		WHEN vocation = 'Liaison régionale' THEN 7
		WHEN vocation = 'Liaison principale' THEN 6
		WHEN vocation = 'Liaison locale' THEN 7
		ELSE 8
		END
	)/100000
	ELSE -1.0
END) as reverse_cost_consumption,
(CASE WHEN acces = 'A péage' THEN true ELSE false END) as filter_toll,
(CASE WHEN acces = 'A péage' THEN 'Paying' ELSE 'Free' END) as cost,
(CASE WHEN class_adm = 'Autoroute' THEN true ELSE false END) as filter_highway,
st_force2d(r.wkb_geometry) as the_geom
into edge
from route r;

create index edge_geom_idx on edge using gist(the_geom);



select pgr_createtopology('edge',0.0001, clean:=true);

ENDSQL

dc exec -u 999 postgres psql $POSTGRES_DB -c "$sql_request"
dc restart node
