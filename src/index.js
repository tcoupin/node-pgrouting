"use strict";

const debug = require( "debug" )( "pgr:main" ),
      debugSql = require( "debug" )( "pgr:sql" ),
      routeError = require( "./routeError" ),
      sqlBuilder = require( "./sqlBuilder" ),
      paramsChecker = require( "./paramsChecker" ),
      { Pool, Client } = require( "pg" );

class Engine {
  constructor( conf ) {
    debug( "constructor" );
    this.conf = conf || {};
    this.conf.table = this.conf.table || process.env.PGTABLE || "edge";
    this.conf.maxSnappingDistance = this.conf.maxSnappingDistance || 100;
    this.conf.snappingRatio = this.conf.snappingRatio || 0;


    if ( this.conf.table.split( "." ).length == 2 ) {
      this.conf.schema = this.conf.table.split( "." )[ 0 ];
      this.conf.table = this.conf.table.split( "." )[ 1 ];
    } else {
      this.conf.schema = "public";
    }
    if ( this.conf.tableVertices === undefined ) {
      this.conf.tableVertices = this.conf.table + "_vertices_pgr";
    } else {
      if ( this.conf.tableVertices.split( "." ).length == 2 ) {
        this.conf.tableVertices = this.conf.tableVertices.split( "." )[ 1 ];
      }
    }
  }

  connect() {
    debug( "connect" );
    this.pool = new Pool({
      user: this.conf.user,
      host: this.conf.host,
      database: this.conf.database,
      password: this.conf.password,
      port: this.conf.port
    });
  }

  toString() {
    return JSON.stringify( this, null, " " );
  }

  close() {
    debug( "close connection" );
    return this.pool.end();
  }

  pgVersion() {
    return new Promise( ( resolve, reject ) => {
      this.pool.query( sqlBuilder.getPgVersion() )
        .then( ( results ) => {
          resolve( results.rows[ 0 ].version );
        })
        .catch( ( e ) => {
          reject( e );
        });
    });
  }

  getTypes() {
    return new Promise( async ( resolve, reject ) => {
      if ( this._listTypes === undefined ) {
        try {
          let columns = await this._getTableColumns();
          this._listTypes = [];
          columns.forEach( ( v ) => {
            if ( v.indexOf( "cost_" ) == 0 ) {
              this._listTypes.push( v.replace( "cost_", "" ) );
            }
          });
        } catch ( e ) {
          this._listTypes = [];
        }
      }
      resolve( this._listTypes );
    });
  }

  getFilters() {
    return new Promise( async ( resolve, reject ) => {
      if ( this._listFilters === undefined ) {
        try {
          let columns = await this._getTableColumns();
          this._listFilters = [];
          columns.forEach( ( v ) => {
            if ( v.indexOf( "filter_" ) == 0 ) {
              this._listFilters.push( v.replace( "filter_", "" ) );
            }
          });
        } catch ( e ) {
          this._listFilters = [];
        }
      }
      resolve( this._listFilters );
    });
  }

  getProperties() {
    return new Promise( async ( resolve, reject ) => {
      if ( this._listProperties === undefined ) {
        try {
          let columns = await this._getTableColumns();
          this._listProperties = [];
          columns.forEach( ( v ) => {
            if ( v == "id" || v == "source" || v == "target" || v == "the_geom" || v.indexOf( "cost_" ) == 0 || v.indexOf( "reverse_cost_" ) == 0 || v.indexOf( "filter_" ) == 0 || v == "seq" ) {
              return;
            }
            this._listProperties.push( v );
          });
        } catch ( e ) {
          this._listProperties = [];
        }
      }
      resolve( this._listProperties );
    });
  }

  routing( params ) {
    return new Promise( async ( resolve, reject ) => {
      try {
        let response = {
            type: "FeatureCollection",
            snappingDistance: {},
            cost: {},
            features: []
          },
          types = await this.getTypes(),
          filters = await this.getFilters(),
          properties = await this.getProperties();

        paramsChecker.routing( params, types, filters );

        types.forEach( ( v ) => {
          response.cost[ v ] = 0;
        });

        let StartEndPoints = await Promise.all( [ this._findNearestEdge( params.from, params.avoid ), this._findNearestEdge( params.to, params.avoid ) ] );
        let startPoints = StartEndPoints[ 0 ];
        let endPoints = StartEndPoints[ 1 ];

        let path = await this._searchPath( params.type, startPoints, endPoints, params.avoid );
        if ( path.length == 0 ) {
          throw routeError.canNotCompute();
        }
        path.forEach( ( step ) => {
          step.the_geom = JSON.parse( step.the_geom );
        });

        let startPoint = startPoints[ path[ 0 ].start_pid - 1 ];
        startPoint.edge_point = JSON.parse( startPoint.edge_point );
        let endPoint = endPoints[ path[ 0 ].end_pid - 1 - startPoints.length ];
        endPoint.edge_point = JSON.parse( endPoint.edge_point );


        // Response building
        response.snappingDistance.start = startPoint.distance;
        response.features.push({
          type: "Feature",
          properties: {
            seq: 0
          },
          geometry: {
            type: "LineString",
            coordinates: [
              params.from.reverse(),
              startPoint.edge_point.coordinates
            ]
          }
        });
        let nbseq = 0;
        path.forEach( ( step ) => {
          nbseq++;
          let feat = {
            type: "Feature",
            properties: {
              seq: parseInt( step.seq )
            },
            geometry: step.the_geom
          };
          types.forEach( ( type ) => {
            feat.properties[ type ] = step[ type ];
            response.cost[ type ] += step[ type ];
          });
          properties.forEach( ( prop ) => {
            feat.properties[ prop ] = step[ prop ];
          });
          response.features.push( feat );
        });

        response.snappingDistance.end = endPoint.distance;
        response.features.push({
          type: "Feature",
          properties: {
            seq: ++nbseq
          },
          geometry: {
            type: "LineString",
            coordinates: [
              endPoint.edge_point.coordinates,
              params.to.reverse()
            ]
          }
        });


        resolve( response );
      } catch ( e ) {
        if ( e instanceof routeError.class ) {
          reject( e );
        } else {
          reject( routeError.canNotCompute( e ) );
        }
      }

    });
  }

  isocurve( params ) {
    return new Promise( async ( resolve, reject ) => {
      try {
        let response = {
            type: "FeatureCollection",
            features: []
          },
          types = await this.getTypes(),
          filters = await this.getFilters();

        paramsChecker.isocurve( params, types, filters );

        let startEndPoints = await this._findNearestEdge( ( params.direct ? params.from : params.to ), params.avoid );

        let curves = [];
        for ( let i = 0 ; i < params.values.length ; i++ ) {
          curves.push( this._computeIsoCurve( params.direct, params.type, startEndPoints, params.avoid, params.values[ i ] ) );
        }

        curves = await Promise.all( curves );

        for ( let i = 0 ; i < params.values.length ; i++ ) {
          response.features.push({
            type: "Feature",
            properties: {
              value: params.values[ i ]
            },
            geometry: JSON.parse( curves[ i ][ 0 ].the_geom )
          });
        }

        resolve( response );
      } catch ( e ) {
        if ( e instanceof routeError.class ) {
          reject( e );
        } else {
          reject( routeError.canNotCompute( e ) );
        }
      }
    });
  }


  _getTableColumns() {
    return new Promise( ( resolve, reject ) => {
      if ( this._listColumns !== undefined ) {
        resolve( this._listColumns );
        return;
      }
      this.pool.query( sqlBuilder.getColumnsForTable(), [ this.conf.schema, this.conf.table ] )
        .then( ( results ) => {
          this._listColumns = results.rows.map( ( v ) => {
            return v.column_name;
          });
          resolve( this._listColumns );
        })
        .catch( ( e ) => {
          resolve( [] );
        });
    });
  }



  _findNearestEdge( pos, filters ) {
    return new Promise( ( resolve, reject ) => {
      var sqlRequest;
      if ( this.conf.snappingRatio == 0 ) {
        sqlRequest = sqlBuilder.findNearestPoint( this.conf.schema, this.conf.table, this.conf.maxSnappingDistance, filters );
      } else {
        sqlRequest = sqlBuilder.findNearestPoints( this.conf.schema, this.conf.table, this.conf.maxSnappingDistance, this.conf.snappingRatio, filters );
      }
      debug( "findNearestEdge" );
      debugSql( sqlRequest );
      this.pool.query( sqlRequest, pos )
        .then( ( results ) => {
          if ( results.rows.length == 0 ) {
            reject( routeError.canNotCompute( "SnappingError, can not link (" + pos + ") to the network (max. distance: " + this.conf.maxSnappingDistance + "m)" ) );
            return;
          }
          results.rows.forEach( ( r ) => {
            if ( r.fraction == 0 ) {
              r.fraction = 0.00001;
            }
            if ( r.fraction == 1 ) {
              r.fraction = 0.99999;
            }
          });
          resolve( results.rows );
        })
        .catch( ( e ) => {
          reject( routeError.canNotCompute( e ) );
        });
    });
  }

  _searchPath( type, startPoints, endPoints, filters ) {
    return new Promise( async ( resolve, reject ) => {
      let types = await this.getTypes();
      let properties = await this.getProperties();
      let sqlRequest = sqlBuilder.searchPath( this.conf.schema, this.conf.table, type, startPoints, endPoints, types, filters, properties );
      debug( "searchPath" );
      debugSql( sqlRequest );
      this.pool.query( sqlRequest )
        .then( ( results ) => {
          resolve( results.rows );
        })
        .catch( ( e ) => {
          reject( e );
        });
    });
  }

  _computeIsoCurve( sens, type, startEndPoint, filters, value ) {
    return new Promise( async ( resolve, reject ) => {
      let sqlRequest = sqlBuilder.isoCurve( this.conf.schema, this.conf.table, this.conf.tableVertices, sens, type, startEndPoint, filters, value );
      debug( "computeIsoCurve" );
      debugSql( sqlRequest );
      this.pool.query( sqlRequest )
        .then( ( results ) => {
          resolve( results.rows );
        })
        .catch( ( e ) => {
          reject( e );
        });
    });
  }
}

module.exports = function( conf ) {
  let re = new Engine( conf );
  re.connect();
  return re;
};
