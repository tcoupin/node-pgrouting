module.exports = function(conf){
	const express = require('express');
	const app = express();

	const routeEngine = require('../../src/index')({
		maxSnappingDistance: 10000,
		snappingRatio: 0.6
	})

	//compute
	app.get('/route', async function(req,res){
		try {
			let results = await routeEngine.routing(req.query);
			res.json(results);
		} catch (e){
			if (e.name == 'routeError'){
				res.status(400).send(e);
			} else {
				res.status(500).send("Internal Server Error: "+e);
			}
		}
	})
	app.get('/capabilities', async function(req,res){
		try {
			let types = await routeEngine.getTypes();
			let filters = await routeEngine.getFilters();
			let properties = await routeEngine.getProperties();
			res.json({types: types, filters: filters, properties: properties});
		} catch (e){
			if (e.name == 'routeError'){
				res.status(400).send(e);
			} else {
				res.status(500).send("Internal Server Error: "+e);
			}
		}
	})

	//version
	app.get('/version', async (req,res)=>{
		try {
			let results = await routeEngine.pgVersion();
			res.send(results)
		} catch (e){
			res.status(500).send("Internal Server Error: "+e);
		}
	})

	return app;
}