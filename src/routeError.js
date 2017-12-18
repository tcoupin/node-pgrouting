"use strict";

class routeError extends Error {

  constructor( type, text ) {
    super( type + ": " + text );
    this.name = "routeError";
    Error.captureStackTrace( this, this.constructor );
    // Customization start here
    this.type = type || "Unkonw";
    this.text = text || "An unkown error append";
  }

};

module.exports = {
  missingParameter: function( text ) {
    return new routeError( "MissingParameter", text );
  },
  invalidParameter: function( text ) {
    return new routeError( "InvalidParamerer", text );
  },
  canNotCompute: function( text ) {
    return new routeError( "CanNotCompute", text );
  },
  class: routeError
};
