"use strict";
module.exports = class routeError extends Error {

  constructor(type, text) {
		super(type+": "+text);
		this.name = this.constructor.name;
		Error.captureStackTrace(this, this.constructor);
		// Customization start here
		this.type = type || 'Unkonw';
		this.text = text || 'An unkown error append';
	}


}