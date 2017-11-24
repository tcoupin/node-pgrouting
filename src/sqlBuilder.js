function filterToWhereClause(filters,prefix){
	let filters_where;
	if (filters === undefined || filters == ""){
		filters_where = ""
	} else {
		filters_where=[]
		filters.forEach((v)=>{
			filters_where.push("edge_table.filter_"+v+" <> true")
		})
		filters_where=filters_where.join(" AND ")
		filters_where = prefix+" "+filters_where
	}
	return filters_where;
}
module.exports = {
	getPgVersion: function(){
		return "SELECT version FROM pgr_version()"
	},
	getColumnsForTable: function(){
		return "SELECT * FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2";
	},
	findNearestPoint: function(schema,table,maxSnappingDistance, filters){
		let filters_where = filterToWhereClause(filters,"AND");
		return `SELECT 	edge_table.id as edge_id,
						st_LineLocatePoint(edge_table.the_geom,st_setsrid(st_makepoint($2,$1),4326)) as fraction,
						st_distance(edge_table.the_geom,st_setsrid(st_makepoint($2,$1),4326),true) as distance,
						ST_AsGeoJSON(st_LineInterpolatePoint(edge_table.the_geom,st_LineLocatePoint(edge_table.the_geom,st_setsrid(st_makepoint($2,$1),4326)))) as edge_point
				FROM ${schema}.${table} as edge_table
				WHERE st_dwithin(edge_table.the_geom,st_setsrid(st_makepoint($2,$1),4326),${maxSnappingDistance},true) ${filters_where}
				ORDER BY st_distance(edge_table.the_geom,st_setsrid(st_makepoint($2,$1),4326),true)
				LIMIT 1`
	},
	findNearestPoints: function(schema, table, maxSnappingDistance, snappingRatio, filters){
		let filters_where = filterToWhereClause(filters,"AND");
		return `
				SELECT 	edge_id,
						fraction,
						distance,
						edge_point
				FROM (
					SELECT 	*,
							(case when (min(distance) over (order by distance)) = 0 then (case when distance = 0 then 0 else 100 end) else (distance-(min(distance) over (order by distance)))/(min(distance) over (order by distance)) end) ratio,
							(	select edge_table.id
								from ${schema}.${table} as edge_table
								where 	st_dwithin(edge_table.the_geom,st_setsrid(st_makepoint($2,$1),4326),${maxSnappingDistance},true) and
										st_intersects(edge_table.the_geom, new_geom) and
										edge_table.id <> edge_id
								limit 1
							) intersectsother
					FROM (
						SELECT 	edge_table.id as edge_id,
								st_LineLocatePoint(edge_table.the_geom,st_setsrid(st_makepoint($2,$1),4326)) as fraction,
								st_distance(edge_table.the_geom,st_setsrid(st_makepoint($2,$1),4326),true) as distance,
								ST_AsGeoJSON(st_LineInterpolatePoint(edge_table.the_geom,st_LineLocatePoint(edge_table.the_geom,st_setsrid(st_makepoint($2,$1),4326)))) as edge_point,
								st_linesubstring(
									ST_MakeLine(
										st_setsrid(st_makepoint($2,$1),4326),
										ST_ClosestPoint(
											edge_table.the_geom,
											st_setsrid(st_makepoint($2,$1),4326)
										)
								),0.0001,0.9999) new_geom
						FROM ${schema}.${table} as edge_table
						WHERE st_dwithin(edge_table.the_geom,st_setsrid(st_makepoint($2,$1),4326),${maxSnappingDistance},true) ${filters_where}
						ORDER BY st_distance(edge_table.the_geom,st_setsrid(st_makepoint($2,$1),4326),true)
					) tmp
				) tmp
				WHERE ratio < ${snappingRatio} AND intersectsother is null
				`
	},
	searchPath: function(schema, table, type, startPoints, endPoints, types, filters, properties){
		const getStartId="select -start_pid from startandstop";
		const getStartFraction="select fraction from points where pid = ("+getStartId+")";
		const getEndId="select -end_pid from startandstop";
		const getEndFraction="select fraction from points where pid = ("+getEndId+")";
		function costSection(type, nbStartPoint){
			return `
				    ((case
				    when tmp.source_node<0 and tmp.source_node>=${-nbStartPoint} and tmp.target_node<${-nbStartPoint} OR tmp.source_node<${-nbStartPoint} and tmp.target_node<0 and tmp.target_node>=${-nbStartPoint} then (case when (${getStartFraction}) < ((${getEndFraction})) then (((${getEndFraction}))-(${getStartFraction}))*edge_table.cost_${type} else ((${getStartFraction})-((${getEndFraction})))*edge_table.reverse_cost_${type} end)
				    when tmp.source_node<0 and tmp.source_node>=${-nbStartPoint} then (case when tmp.target_node = edge_table.target then (1-(${getStartFraction}))*edge_table.cost_${type} else ((${getStartFraction}))*edge_table.reverse_cost_${type} END)
				    when tmp.target_node<${-nbStartPoint} then (case when tmp.source_node = edge_table.source then ((${getEndFraction}))*edge_table.cost_${type} else (1-((${getEndFraction})))*edge_table.reverse_cost_${type} end)
				    else (case when tmp.source_node = edge_table.source then edge_table.cost_${type} else edge_table.reverse_cost_${type} END)
				    end)) as ${type},
				`
		}
		let table_tmpPoints = [];
		let startPtsIds=[];
		let endPtsIds=[];
		startPoints.forEach((pt)=>{
			startPtsIds.push(-startPtsIds.length-1)
			table_tmpPoints.push("("+(startPtsIds.length)+","+pt.edge_id+","+pt.fraction+")");
		});
		endPoints.forEach((pt)=>{
			endPtsIds.push(-startPtsIds.length-endPtsIds.length-1)
			table_tmpPoints.push("("+(startPtsIds.length+endPtsIds.length)+","+pt.edge_id+","+pt.fraction+")");
		});
		table_tmpPoints = "SELECT pid::integer, edge_id::integer, fraction::float FROM (values "+table_tmpPoints.join(",")+") as t (pid, edge_id, fraction)";
		let types_sections ="";
		let types_aggregate = ""
		types.forEach((type)=>{
			types_sections=types_sections+costSection(type,startPtsIds.length)
			types_aggregate = types_aggregate+"sum(tmp."+type+") as "+type+", "
		})

		let filters_where = filterToWhereClause(filters,"WHERE");

		let properties_list=properties.join(', ');
		let properties_agg=properties.map((v)=>{
			return "(case when "+v+" is null then 'null' else "+v+" end)"
		}).join(" || '|' || ");
		let properties_select = "";
		properties.forEach((v)=>{
			properties_select=properties_select+"edge_table."+v+" as "+v+",";
		})


		return `
				
				with results as (select *
				FROM pgr_withPoints(
				    'SELECT edge_table.id, edge_table.source, edge_table.target, edge_table.cost_${type} as cost, edge_table.reverse_cost_${type} as reverse_cost FROM ${schema}.${table} as edge_table ${filters_where}',
				    '${table_tmpPoints}',
				    Array[${startPtsIds.join(',')}], Array[${endPtsIds.join(',')}])),
				startandstop as (select start_pid, end_pid from results where edge=-1 order by agg_cost limit 1),
				bestresult as (select * from results where start_pid = (select start_pid from startandstop) and end_pid = (select end_pid from startandstop)),
				points as (${table_tmpPoints}) 
				select ${types_aggregate}
				${properties_list},
			 	flag_groupid as seq,
				st_asgeojson(ST_LineMerge(St_union(the_geom))) the_geom,
				(${getStartId}) as start_pid,
				(${getEndId}) as end_pid
				from (
				select *, sum(flag_newgroup) over (order by seq) flag_groupid from (    
				select 
				    ${types_sections}
				    tmp.seq seq,
				    (case when lag(${properties_agg}) OVER (order by seq)=${properties_agg} then 0 else 1 end) flag_newgroup,
				    ${properties_select}
				    ((((case
				    when tmp.source_node<0 and tmp.source_node>=${-startPtsIds.length} and tmp.target_node<${-startPtsIds.length} OR tmp.source_node<${-startPtsIds.length} and tmp.target_node<0 and tmp.target_node>=${-startPtsIds.length} then (case when (${getStartFraction}) < ((${getEndFraction})) then ST_LineSubstring(edge_table.the_geom,(${getStartFraction}), ((${getEndFraction}))) else st_reverse(ST_LineSubstring(edge_table.the_geom, ((${getEndFraction})), (${getStartFraction}))) end)
				    when tmp.source_node<0 and tmp.source_node>=${-startPtsIds.length} then (case when tmp.target_node = edge_table.target then ST_LineSubstring(edge_table.the_geom,(${getStartFraction}) ,1) else st_reverse(ST_LineSubstring(edge_table.the_geom,0,(${getStartFraction}))) END)
				    when tmp.target_node<${-startPtsIds.length} then (case when tmp.source_node = edge_table.source then ST_LineSubstring(edge_table.the_geom,0,((${getEndFraction}))) else st_reverse(ST_LineSubstring(edge_table.the_geom,((${getEndFraction})),1)) end)
				    else (case when tmp.source_node = edge_table.source then edge_table.the_geom else st_reverse(edge_table.the_geom) END)
				    end))))the_geom
				from 
				(
				select
					rs.seq as seq,
					rs.node as source_node,
				    rt.node as target_node,
				    rs.edge as edge
				from bestresult as rs, bestresult as rt
				where rs.seq = rt.seq-1) tmp
				inner join ${schema}.${table} as edge_table
				on edge_table.id=tmp.edge ) tmp ) tmp group by flag_groupid, ${properties_list}  order by seq
				`
	}
}