const assert = require('assert');
const routeEngine = require('../src/index');
require('it-each')({ testPerIteration: true });
const samples = require('./samples');

describe('Configuration', () => {
	describe('Table parameter', () => {
		it('Default value is "edge"',()=>{
			let re = routeEngine();
			assert.equal(re.conf.table, 'edge');
			re.close();
		});
		it('Use env value',()=>{
			let oldValue = process.env.PGTABLE;
			process.env.PGTABLE='foobar'
			let re = routeEngine();
			if (oldValue === undefined){
				delete process.env.PGTABLE
			} else {
				process.env.PGTABLE = oldValue;
			}
			assert.equal(re.conf.table, 'foobar');
			re.close();
		});
		it('Use conf value',()=>{
			let re = routeEngine({table:'barfoo'});
			assert.equal(re.conf.table, 'barfoo');
			re.close();
		});
	});
	describe('maxSnappingDistance parameter', () => {
		it('Default value is 100',()=>{
			let re = routeEngine();
			assert.equal(re.conf.maxSnappingDistance, 100);
			re.close();
		});
		it('Use conf value',()=>{
			let re = routeEngine({maxSnappingDistance: 42});
			assert.equal(re.conf.maxSnappingDistance, 42);
			re.close();
		});
	});
	describe('Detect schema in table parameter', () => {
		it('"public" for default table parameter value',()=>{
			let re = routeEngine();
			assert.equal(re.conf.schema, 'public');
			re.close();
		});
		it('"public" when no dot in table parameter value',()=>{
			let re = routeEngine({table: 'foobar'});
			assert.equal(re.conf.schema, 'public');
			re.close();
		});
		it('Detect schema when dot in table parameter value',()=>{
			let re = routeEngine({table: "foo.bar"});
			assert.equal(re.conf.table, 'bar');
			assert.equal(re.conf.schema, 'foo');
			re.close();
		});
	});
});


describe('getVersion function',()=>{
	it("Must be a valid version", async ()=>{
		let re = routeEngine();
		let version = await re.pgVersion();
		assert.equal(version,version.match(/[0-9]+\.[0-9]+\.[0-9]+/)[0]);
	})
	it("Must return database error", async ()=>{
		let re = routeEngine({host:"0.0.0.0"});
		try {
			let version = await re.pgVersion();
			assert.fail();
		} catch(e){
			assert.equal(e.toString(),"Error: connect ECONNREFUSED 0.0.0.0:5432")
		}
		
	})
});

describe("Table dependent parameter",()=>{
	describe('Types of routing',()=>{
		it("Must be [distance,duration,consumption] in provided dataset",async ()=>{
			let re = routeEngine();
			let listTypes = await re.getTypes();
			assert.deepEqual(listTypes,[ 'distance', 'duration', 'consumption'])
		})
		it("Must be empty list on database error",async ()=>{
			let re = routeEngine({host:'0.0.0.0'});
			let listTypes = await re.getTypes();
			assert.deepEqual(listTypes,[])
		})
	});
	
	describe('Filters',()=>{
		it("Must be [toll,highway] in provided dataset",async ()=>{
			let re = routeEngine();
			let listFilters = await re.getFilters();
			assert.deepEqual(listFilters,['toll','highway'])
		})
		it("Must be empty list on database error",async ()=>{
			let re = routeEngine({host:'0.0.0.0'});
			let listFilters = await re.getFilters();
			assert.deepEqual(listFilters,[])
		})
	});
	describe('Properties',()=>{
		it("Must be [name,cost] in provided dataset",async ()=>{
			let re = routeEngine();
			let listProperties = await re.getProperties();
			assert.deepEqual(listProperties,['name','cost'])
		})
		it("Must be empty list on database error",async ()=>{
			let re = routeEngine({host:'0.0.0.0'});
			let listProperties = await re.getProperties();
			assert.deepEqual(listProperties,[])
		})
	});
});

describe("Routing function",()=>{
	let re = routeEngine({maxSnappingDistance:10000});
	let validParam = {
		from: '46,1',
		to: '47,2',
		type: 'duration'
	}

	let runExepectedError = async function(param,error){
		try {
			let resp = await re.routing(param);
			assert.fail();
		} catch (e){
			assert.equal(e,error)
		}
	}
	describe("Check parameters",()=>{
		describe("from parameters",()=>{
			it("Must exist",async ()=>{
				let param = Object.assign({},validParam);
				delete param.from;
				await runExepectedError(param,"routeError: MissingParameter: from")
			})
			it("Must be a 2D point", async ()=>{
				let param = Object.assign({},validParam,{from:"0.0"});
				await runExepectedError(param,"routeError: InvalidParamerer: from is not a 2D point")
			})
			it("Must have a valid longitude (<180)", async ()=>{
				let param = Object.assign({},validParam,{from:"0,200"});
				await runExepectedError(param,"routeError: InvalidParamerer: from has an invalid longitude")
			})
			it("Must have a valid longitude (>-180)", async ()=>{
				let param = Object.assign({},validParam,{from:"0,-200"});
				await runExepectedError(param,"routeError: InvalidParamerer: from has an invalid longitude")
			})
			it("Must have a valid latitude (<90)", async ()=>{
				let param = Object.assign({},validParam,{from:"100,0"});
				await runExepectedError(param,"routeError: InvalidParamerer: from has an invalid latitude")
			})
			it("Must have a valid latitude (>-90)", async ()=>{
				let param = Object.assign({},validParam,{from:"-100,0"});
				await runExepectedError(param,"routeError: InvalidParamerer: from has an invalid latitude")
			})
			it("Can be valid too!", async ()=>{
				let param = Object.assign({},validParam);
				await re.routing(param)
			})
		})
		describe("to parameters",()=>{
			it("Must exist",async ()=>{
				let param = Object.assign({},validParam);
				delete param.to;
				await runExepectedError(param,"routeError: MissingParameter: to")
			})
			it("Must be a 2D point", async ()=>{
				let param = Object.assign({},validParam,{to:"0.0"});
				await runExepectedError(param,"routeError: InvalidParamerer: to is not a 2D point")
			})
			it("Must have a valid longitude (<180)", async ()=>{
				let param = Object.assign({},validParam,{to:"0,200"});
				await runExepectedError(param,"routeError: InvalidParamerer: to has an invalid longitude")
			})
			it("Must have a valid longitude (>-180)", async ()=>{
				let param = Object.assign({},validParam,{to:"0,-200"});
				await runExepectedError(param,"routeError: InvalidParamerer: to has an invalid longitude")
			})
			it("Must have a valid latitude (<90)", async ()=>{
				let param = Object.assign({},validParam,{to:"100,0"});
				await runExepectedError(param,"routeError: InvalidParamerer: to has an invalid latitude")
			})
			it("Must have a valid latitude (>-90)", async ()=>{
				let param = Object.assign({},validParam,{to:"-100,0"});
				await runExepectedError(param,"routeError: InvalidParamerer: to has an invalid latitude")
			})
			it("Can be valid too!", async ()=>{
				let param = Object.assign({},validParam);
				await re.routing(param)
			})
		})
		describe("type parameter",()=>{
			it("Must exist",async ()=>{
				let param = Object.assign({},validParam);
				delete param.type;
				await runExepectedError(param,"routeError: MissingParameter: type")
			})
			it("Must be in [distance,duration,consumption] in provided dataset",async ()=>{
				let param = Object.assign({},validParam,{type:'foobar'});
				await runExepectedError(param,"routeError: InvalidParamerer: type must be in [distance,duration,consumption]")
			})
			it("Can be 'duration' in provided dataset", async ()=>{
				let param = Object.assign({},validParam,{type:'duration'});
				await re.routing(param)
			})
			it("Can be 'distance' in provided dataset", async ()=>{
				let param = Object.assign({},validParam,{type:'distance'});
				await re.routing(param)
			})
			it("Can be 'consumption' in provided dataset", async ()=>{
				let param = Object.assign({},validParam,{type:'consumption'});
				await re.routing(param)
			})
		})
		describe("avoid parameter",()=>{
			it("Can be empty", async ()=>{
				let param = Object.assign({},validParam);
				delete param.avoid
				await re.routing(param)
			})
			it("Must be in [toll,highway] in provided dataset",async ()=>{
				let param = Object.assign({},validParam,{avoid:'foobar'});
				await runExepectedError(param,"routeError: InvalidParamerer: avoid must be in [toll,highway]")
			})
			it("Can be 'toll' in provided dataset", async ()=>{
				let param = Object.assign({},validParam,{avoid:'toll'});
				await re.routing(param)
			})
			it("Can be 'highway' in provided dataset", async ()=>{
				let param = Object.assign({},validParam,{avoid:'highway'});
				await re.routing(param)
			})
			it("Can be 'highway,toll' in provided dataset", async ()=>{
				let param = Object.assign({},validParam,{avoid:'highway,toll'});
				await re.routing(param)
			})
			it("Can be 'toll,highway' in provided dataset", async ()=>{
				let param = Object.assign({},validParam,{avoid:'toll,highway'});
				await re.routing(param)
			})
		})
	})
	describe("Routing test",()=>{
		it.each(samples, "%s", ['name'], async (item,done)=>{
			try {
				let results = await re.routing(item.params);
				assert.deepEqual(results,item.response);
				done()
			} catch (e){
				done(e)
			}
		})
	})
});