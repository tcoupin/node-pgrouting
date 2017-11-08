module.exports = {
	getPgVersion: function(){
		return "SELECT version FROM pgr_version()"
	},
	getColumnsForTable: function(){
		return "SELECT * FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2";
	},
	findNearestPoint: function(schema,table,maxSnappingDistance, filters){
		let filters_where;
		if (filters === undefined || filters == ""){
			filters_where = ""
		} else {
			filters_where=[]
			filters.forEach((v)=>{
				filters_where.push("filter_"+v+" <> true")
			})
			filters_where=" AND "+filters_where.join(" AND ")
		}
		return `SELECT 	id as edge_id,
						st_LineLocatePoint(the_geom,st_setsrid(st_makepoint($2,$1),4326)) fraction,
						st_distance(the_geom,st_setsrid(st_makepoint($2,$1),4326),true) distance,
						ST_AsGeoJSON(st_LineInterpolatePoint(the_geom,st_LineLocatePoint(the_geom,st_setsrid(st_makepoint($2,$1),4326)))) edge_point
				FROM ${schema}.${table}
				WHERE st_dwithin(the_geom,st_setsrid(st_makepoint($2,$1),4326),${maxSnappingDistance},true) ${filters_where}
				ORDER BY st_distance(the_geom,st_setsrid(st_makepoint($2,$1),4326),true)
				LIMIT 1`
	},
	searchPath: function(schema, table, type, startPoint, endPoint, types, filters, properties){
		function costSection(type, startPoint, endPoint){
			return `
				    ((case
				    when tmp.source_node=-1 then (case when tmp.target_node = edge_table.target then (1-${startPoint.fraction})*cost_${type} else (${startPoint.fraction})*reverse_cost_${type} END)
				    when tmp.target_node=-2 then (case when tmp.source_node = edge_table.source then ${endPoint.fraction}*cost_${type} else (1-${endPoint.fraction})*reverse_cost_${type} end)
				    else (case when tmp.source_node = edge_table.source then cost_${type} else reverse_cost_${type} END)
				    end)) ${type},
				`
		}
		let types_sections ="";
		let types_aggregate = ""
		types.forEach((type)=>{
			types_sections=types_sections+costSection(type,startPoint,endPoint)
			types_aggregate = types_aggregate+"sum("+type+") "+type+", "
		})

		let filters_where;
		if (filters === undefined || filters == ""){
			filters_where = ""
		} else {
			filters_where=[]
			filters.forEach((v)=>{
				filters_where.push("filter_"+v+" <> true")
			})
			filters_where="WHERE "+filters_where.join(" AND ")
		}

		let properties_list=properties.join(', ');
		let properties_agg=properties.join(" || '|' || ");
		let properties_select = "";
		properties.forEach((v)=>{
			properties_select=properties_select+"edge_table."+v+" as "+v+",";
		})

		return `
				with results as (select *
				FROM pgr_withPoints(
				    'SELECT id, source, target, cost_${type} as cost, reverse_cost_${type} as reverse_cost FROM ${schema}.${table} ${filters_where}',
				    'SELECT 1 as pid, ${startPoint.edge_id} as edge_id, ${startPoint.fraction}::float as fraction
				    UNION ALL
				    SELECT 2, ${endPoint.edge_id}, ${endPoint.fraction}',
				    -1, -2))
				select ${types_aggregate}
				${properties_list},
			 	flag_groupid as seq,
				st_asgeojson(st_union(the_geom)) the_geom from (
				select *, sum(flag_newgroup) over (order by seq) flag_groupid from (    
				select 
				    ${types_sections}
				    tmp.seq seq,
				    (case when lag(${properties_agg}) OVER (order by seq)=${properties_agg} then 0 else 1 end) flag_newgroup,
				    ${properties_select}
				    ((((case
				    when tmp.source_node=-1 then (case when tmp.target_node = edge_table.target then ST_LineSubstring(edge_table.the_geom,${startPoint.fraction} ,1) else st_reverse(ST_LineSubstring(edge_table.the_geom,0,${startPoint.fraction})) END)
				    when tmp.target_node=-2 then (case when tmp.source_node = edge_table.source then ST_LineSubstring(edge_table.the_geom,0,${endPoint.fraction}) else st_reverse(ST_LineSubstring(edge_table.the_geom,${endPoint.fraction},1)) end)
				    else (case when tmp.source_node = edge_table.source then edge_table.the_geom else st_reverse(edge_table.the_geom) END)
				    end))))the_geom
				from 
				(
				select
					rs.seq as seq,
					rs.node as source_node,
				    rt.node as target_node,
				    rs.edge as edge
				from results as rs, results as rt
				where rs.seq = rt.seq-1) tmp
				inner join ${schema}.${table} as edge_table
				on edge_table.id=tmp.edge ) tmp ) tmp group by flag_groupid, ${properties_list}  order by seq
				`
	}
}