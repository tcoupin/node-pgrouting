"use strict";
const routeError = require('./routeError');
const sqlBuilder = require('./sqlBuilder');
const { Pool, Client } = require('pg');

class RouteEngine {
  constructor(conf) {
    this.conf = conf || {};
    this.conf.table = this.conf.table || process.env.PGTABLE || 'edge';
    this.conf.maxSnappingDistance = this.conf.maxSnappingDistance || 100;
    this.conf.snappingRatio = this.conf.snappingRatio || 0;


    if (this.conf.table.split('.').length == 2){
      this.conf.schema = this.conf.table.split('.')[0];
      this.conf.table = this.conf.table.split('.')[1];
    } else {
      this.conf.schema = 'public';
    }
  }

  connect(){
    this.pool = new Pool({
      user: this.conf.user,
      host: this.conf.host,
      database: this.conf.database,
      password: this.conf.password,
      port: this.conf.port,
    });
  }

  toString(){
    return JSON.stringify(this,null,' ')
  }

  close(){
    return this.pool.end();
  }

  pgVersion(){
    return new Promise((resolve, reject) => {
      this.pool.query(sqlBuilder.getPgVersion())
      .then((results)=>{
        resolve(results.rows[0].version);
      })
      .catch((e)=>{
        reject(e)
      })
    });
  }

  getTypes() {
    return new Promise(async (resolve,reject)=>{
      if (this._listTypes === undefined){
        try {
          let columns = await this._getTableColumns();
          this._listTypes = [];
          columns.forEach((v)=>{
            if (v.indexOf("cost_")==0){
              this._listTypes.push(v.replace("cost_",""));
            }
          })
        } catch (e){
          this._listTypes = [];
        }
      }
      resolve(this._listTypes);
    });
  }

  getFilters() {
    return new Promise(async (resolve,reject)=>{
      if (this._listFilters === undefined){
        try {
          let columns = await this._getTableColumns();
          this._listFilters = [];
          columns.forEach((v)=>{
            if (v.indexOf("filter_")==0){
              this._listFilters.push(v.replace("filter_",""));
            }
          })
        } catch (e){
          this._listFilters = [];
        }
      }
      resolve(this._listFilters);
    });
  }

  getProperties(){
    return new Promise(async (resolve,reject)=>{
      if (this._listProperties === undefined){
        try {
          let columns = await this._getTableColumns();
          this._listProperties = [];
          columns.forEach((v)=>{
            if (v=="id" || v == "source" || v == "target" || v == "the_geom" || v.indexOf("cost_")==0 || v.indexOf("reverse_cost_")==0 || v.indexOf("filter_")==0 || v == "seq"){
              return;
            }
            this._listProperties.push(v);
          })
        } catch (e){
          this._listProperties = [];
        }
      }
      resolve(this._listProperties);
    });
  }

  routing(params){
    return new Promise(async (resolve,reject)=>{
      try {
        await this._checkParams(params);
        let response={type: "FeatureCollection",snappingDistance:{},cost:{},features:[]}
        let types = await this.getTypes();
        let properties = await this.getProperties();
        types.forEach((v)=>{
          response.cost[v]=0;
        })
        
        let startPoint=await this._findNearestEdge(params.from, params.avoid);
        let endPoint=await this._findNearestEdge(params.to, params.avoid);
        let path = await this._searchPath(params.type, startPoint, endPoint, params.avoid)

        // Response building
        response.snappingDistance["start"] = startPoint.distance;
        response.features.push({
            type: "Feature",
            properties: {
              seq: 0
            },
            geometry: {
              type: "LineString",
              coordinates: [
                params.from.reverse(),
                JSON.parse(startPoint.edge_point).coordinates
              ]
            }
          })
        let nbseq=0
        path.forEach((step)=>{
          nbseq++;
          let feat = {
            type: "Feature",
            properties: {
              seq: parseInt(step.seq)
            },
            geometry: JSON.parse(step.the_geom)
          };
          types.forEach((type)=>{
            feat.properties[type] = step[type];
            response.cost[type]+=step[type];
          })
          properties.forEach((prop)=>{
            feat.properties[prop] = step[prop];
          })
          response.features.push(feat);
        });

        response.snappingDistance["end"] = endPoint.distance;
        response.features.push({
            type: "Feature",
            properties: {
              seq: ++nbseq
            },
            geometry: {
              type: "LineString",
              coordinates: [
                JSON.parse(endPoint.edge_point).coordinates,
                params.to.reverse(),
              ]
            }
          })

        //
        
        resolve(response);
      } catch (e){
        reject(e)
      }
      
    })
  }

  async _checkParams(params){
    if (params === undefined){
      throw new routeError("MissingParameter","All")
    }
    if (params.from === undefined)
      throw new routeError("MissingParameter","from")
    params.from = this._checkPoint(params.from,"from")
    
    if (params.to === undefined)
      throw new routeError("MissingParameter","to")
    params.to = this._checkPoint(params.to,"to")

    if (params.type === undefined)
      throw new routeError("MissingParameter","type")
    let listTypes = await this.getTypes()
    if (listTypes.indexOf(params.type)<0)
      throw new routeError("InvalidParamerer","type must be in ["+listTypes.join(',')+"]")

    if (params.avoid !== undefined && params.avoid != ''){

      if ( (typeof params.avoid) == 'string' ){
        params.avoid = params.avoid.split(',')
      }

      let listFilters = await this.getFilters();
      let invalidFilter = false;
      params.avoid.forEach((v)=>{
        if (listFilters.indexOf(v) < 0){
          invalidFilter = true;
        }
      });
      if (invalidFilter)
        throw new routeError("InvalidParamerer","avoid must be in ["+listFilters.join(',')+"]") 
    }
  }

  _getTableColumns(){
    return new Promise((resolve, reject) => {
      if (this._listColumns !== undefined){
        resolve(this._listColumns);
        return;
      }
      this.pool.query(sqlBuilder.getColumnsForTable(),[this.conf.schema, this.conf.table])
      .then((results)=>{
        this._listColumns = results.rows.map((v)=>{return v.column_name});
        resolve(this._listColumns)
      })
      .catch((e)=>{
        resolve([])
      });
    });
  }

  _checkPoint(pointStr,name){
    let point = pointStr.split(',');
    if (point.length != 2)
      throw new routeError("InvalidParamerer", name+" is not a 2D point")
    point[0] = parseFloat(point[0]);
    if (point[0]<-90.0 || point[0]>90.0 || isNaN(point[0]))
      throw new routeError("InvalidParamerer", name+" has an invalid latitude")
    point[1] = parseFloat(point[1]);
    if (point[1]<-180.0 || point[1]>180.0 || isNaN(point[1]))
      throw new routeError("InvalidParamerer", name+" has an invalid longitude")

    return point;
  }

  _findNearestEdge(pos, filters){
    return new Promise((resolve,reject)=>{
      this.pool.query(sqlBuilder.findNearestPoint(this.conf.schema, this.conf.table, this.conf.maxSnappingDistance, filters),pos)
      .then((results)=>{
        if (results.rows.length == 0){
          reject(new routeError("SnappingError","can not link ("+pos+") to the network (max. distance: "+this.conf.maxSnappingDistance+"m)"))
          return;
        }
        if (results.rows[0].fraction == 0){results.rows[0].fraction=0.00001;}
        if (results.rows[0].fraction == 1){results.rows[0].fraction=0.99999;}
        resolve(results.rows[0]);
      })
      .catch((e)=>{
        reject(e)
      });
    })
  }

  _searchPath(type, startPoint, endPoint, filters){
    return new Promise(async (resolve,reject)=>{
      let types = await this.getTypes();
      let properties = await this.getProperties();
      //console.log(sqlBuilder.searchPath(this.conf.schema, this.conf.table, type, startPoint, endPoint, types, filters,properties))
      this.pool.query(sqlBuilder.searchPath(this.conf.schema, this.conf.table, type, startPoint, endPoint, types, filters, properties))
      .then((results)=>{
        resolve(results.rows);
      })
      .catch((e)=>{
        reject(e)
      });
    });
  }
}

module.exports = function(conf){
  let re = new RouteEngine(conf);
  re.connect();
  return re;
}