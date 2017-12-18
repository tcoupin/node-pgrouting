"use strict";

const routeError = require( "./routeError" );

function routing( params, listTypes, listFilters ) {
  let invalidFilter = false;

  if ( params === undefined ) {
    throw routeError.missingParameter( "All" );
  }

  if ( params.from === undefined ) {
    throw routeError.missingParameter( "from" );
  }
  params.from = _checkPoint( params.from, "from" );

  if ( params.to === undefined ) {
    throw routeError.missingParameter( "to" );
  }
  params.to = _checkPoint( params.to, "to" );

  if ( params.type === undefined ) {
    throw routeError.missingParameter( "type" );
  }

  if ( listTypes.indexOf( params.type ) < 0 ) {
    throw routeError.invalidParameter( "type must be in [" + listTypes.join("," ) + "]" );
  }

  if ( params.avoid !== undefined && params.avoid != "" ) {
    if ( ( typeof params.avoid ) == "string" ) {
      params.avoid = params.avoid.split( "," );
    }

    params.avoid.forEach( ( v ) => {
      if ( listFilters.indexOf( v ) < 0 ) {
        invalidFilter = true;
      }
    });
    if ( invalidFilter ) {
      throw routeError.invalidParameter( "avoid must be in [" + listFilters.join( "," ) + "]" );
    }
  }
}

function isocurve( params, listTypes, listFilters ) {
  if ( params === undefined ) {
    throw routeError.missingParameter( "All");
  }

  if ( params.from !== undefined ) {
    params.from = _checkPoint( params.from, "from");
    params.direct = true;
  }

  if ( params.to !== undefined ) {
    params.to = _checkPoint( params.to, "to");
    params.direct = false;
  }

  if ( params.from === undefined && params.to === undefined ) {
    throw routeError.missingParameter( "from or to");
  }

  if ( params.from !== undefined && params.to !== undefined ) {
    throw routeError.invalidParameter( "from or to");
  }

  if ( params.type === undefined ) {
    throw routeError.missingParameter( "type");
  }

  if ( listTypes.indexOf( params.type ) < 0 ) {
    throw routeError.invalidParameter( "type must be in [" + listTypes.join("," ) + "]");
  }

  if ( params.avoid !== undefined && params.avoid != "" ) {
    if ( (typeof params.avoid) == "string" ) {
      params.avoid = params.avoid.split( "," );
    }

    let invalidFilter = false;
    params.avoid.forEach( (v) => {
      if ( listFilters.indexOf( v ) < 0 ) {
        invalidFilter = true;
      }
    });
    if ( invalidFilter ) {
      throw routeError.invalidParameter( "avoid must be in [" + listFilters.join("," ) + "]");
    }
  }

  if ( params.values === undefined ) {
    throw routeError.missingParameter( "values");
  }

  if ( (typeof params.values) == "string" ) {
    params.values = params.values.split("," );
  }

  for ( let i = 0; i < params.values.length; i++ ) {
    params.values[ i ] = parseFloat( params.values[ i ] );
    if ( params.values[ i ] <= 0 ) {
      throw routeError.invalidParameter( "values can not have null or negative values");
    }
  }
}


let _checkPoint = function( pointStr, name ) {
  let point = pointStr.split( "," );

  if ( point.length != 2 ) {
    throw routeError.invalidParameter( name + " is not a 2D point");
  }

  point[ 0 ] = parseFloat( point[ 0 ] );

  if ( point[ 0 ] < -90.0 || point[ 0 ] > 90.0 || isNaN( point[ 0 ] ) ) {
    throw routeError.invalidParameter( name + " has an invalid latitude");
  }

  point[ 1 ] = parseFloat( point[ 1 ] );

  if ( point[ 1 ] < -180.0 || point[ 1 ] > 180.0 || isNaN( point[ 1 ] ) ) {
    throw routeError.invalidParameter( name + " has an invalid longitude");
  }

  return point;
};

module.exports = {
  routing: routing,
  isocurve: isocurve
};
