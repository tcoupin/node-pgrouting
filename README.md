# node-pgrouting

[![Travis](https://img.shields.io/travis/tcoupin/node-pgrouting.svg?style=flat-square)](https://travis-ci.org/tcoupin/node-pgrouting)
[![Dependency Status](https://david-dm.org/tcoupin/node-pgrouting.svg)](https://david-dm.org/tcoupin/node-pgrouting)
[![npm](https://img.shields.io/npm/dt/node-pgrouting.svg?style=flat-square)](https://www.npmjs.com/package/node-pgrouting)
[![npm](https://img.shields.io/npm/v/node-pgrouting.svg?style=flat-square)](https://www.npmjs.com/package/node-pgrouting)
[![Twitter](https://img.shields.io/twitter/url/https/github.com/tcoupin/node-pgrouting.svg?style=social)](https://twitter.com/intent/tweet?text=Wow:&url=https%3A%2F%2Fgithub.com%2Ftcoupin%2Fnode-pgrouting)

A simple interface to pgRouting.

Features:

* Multi-cost
* Filters
* Aggregation of identical sections based on its properties
* Multi-snapping

## How to use ?

### Routing

```javascript
const pgr = require("node-pgrouting")(conf);
let geojeson_results = await pgr.routing({from:"46,1",to:"47,2","type":"duration", "avoid":"toll"});
```

* The `routing` return a Promise, so you can use the async/await like above or the Promise itself.
* `type` and `avoid` depend on data structure (see [Data structure](#data-structure))

### Capabilities (data structure)

```javascript
const pgr = require("node-pgrouting")(conf);
let types = await pgr.getTypes();
```

* The `getTypes` return a Promise, so you can use the async/await like above or the Promise itself.
* `types` is an array of available cost based on data structure (see [Data structure](#data-structure))

```javascript
const pgr = require("node-pgrouting")(conf);
let filters = await pgr.getFilters();
```

* The `getFilters` return a Promise, so you can use the async/await like above or the Promise itself.
* `filters` is an array of available filter based on data structure (see [Data structure](#data-structure))

```javascript
const pgr = require("node-pgrouting")(conf);
let properties = await pgr.getProperties();
```

* The `getProperties` return a Promise, so you can use the async/await like above or the Promise itself.
* `properties` is an array of available feature properties based on data structure (see [Data structure](#data-structure))

### PgRouting version

```javascript
const pgr = require("node-pgrouting")(conf);
let version = await pgr.pgVersion();
```

* The `pgVersion` return a Promise, so you can use the async/await like above or the Promise itself.
* `pgVersion` is the version of PgRouting extension, not PosGIS or Postgresql version.

### Close connection to the database

```javascript
const pgr = require("node-pgrouting")(conf);
...your stuff...
pgr.close();
```

## Configuration

The `conf` object let you configure the connection to the database and some routing options :

* **Connection parameters:** node-pgrouting use [pg](https://node-postgres.com) as an interface to PostgreSQL database, with the `conf` object as parameters like *host*, *port*, *user*, *password* and *database*. You can use same environment variables as libpq too : see [pg documentation](https://node-postgres.com/features/connecting) for more details.
* **table:** : table that contains the network. You can use the environment variable *PGTABLE* too. *table* can contain a schema. (Default: *edge*)
* **maxSnappingDistance:** when process the routing, *node-pgrouting* needs to connect your start and end point to closest edge of the network within *maxSnappingDistance* meters.
* **snappingRatio:** allow to snap not only the nearest point but also all near points with a distance difference lower than *snappingRatio* (=(distance-min(distance))/min(distance)). (Default: 0 (no ratio)).

## Data structure

Requirements: [pgRouting concepts](http://docs.pgrouting.org/latest/en/pgRouting-concepts.html).

The data structure determine the routing capabilites. Some attributes are reserved:
* *id*: an uniq identifier of the network section
* *source*, *target*: for pgRouting topology
* *cost_TYPE* and *reverse_cost_TYPE*: the cost of the section when perform routing to minimize *TYPE*. You can provides as many type as wanted.
* *filter_FILTER*: true to avoid this section by use *avoid: 'FILTER'* in routing params. You can provides as many filter as wanted.
* *the_geom*: geometry of the section, with 4326 SRID.
* *seq*: use in routing response.

All other properties are used to identify the section. If multiple sections have the same properties, they are grouped in the routing response.

### Example:

|   id  |    name    | source | target |  cost_distance   | reverse_cost_distance |  cost_duration   | reverse_cost_duration |  cost_consumption  | reverse_cost_consumption | filter_toll |  cost  | filter_highway |
|-------|------------|--------|--------|------------------|-----------------------|------------------|-----------------------|--------------------|--------------------------|-------------|--------|----------------|
| 10693 | D86        |     65 |     66 | 397.550220811875 |      397.550220811875 | 20.4454399274679 |      20.4454399274679 | 0.0238530132487125 |       0.0238530132487125 | f           | Free   | f              |
|  7711 | A1/E15-E19 |   6497 |   6914 |  3369.1892947396 |       3369.1892947396 | 101.075678842188 |      101.075678842188 |  0.303227036526564 |        0.303227036526564 | t           | Paying | t              |
| 11326 | A10        |     71 |     72 | 702.986479543753 |      702.986479543753 | 21.0895943863126 |      21.0895943863126 | 0.0632687831589378 |       0.0632687831589378 | f           | Free   | t              |
|  7885 | D3         |     45 |     46 | 1238.94362175843 |      1238.94362175843 |  49.557744870337 |       49.557744870337 | 0.0867260535230898 |       0.0867260535230898 | f           | Free   | f              |
|  7663 | D317       |   6819 |   6872 | 5334.01082992236 |      5334.01082992236 | 274.320556967436 |      274.320556967436 |  0.320040649795342 |        0.320040649795342 | f           | Free   | f              |
|  7799 | N104       |   6789 |     46 | 3921.77709540926 |      3921.77709540926 | 117.653312862278 |      117.653312862278 |  0.352959938586834 |        0.352959938586834 | f           | Free   | f              |

This table provides:
- 3 types: distance, duration, consumption
- 2 filters: toll, highway
- 2 properties: name, cost

## Demonstration/Development

1. Start demo/dev environmnent
```
bash dev/up.sh
```

2. Use the GUI or the REST service:

- http://127.0.0.1:8080, graphical interface : use the right click to define start and end point.
- http://127.0.0.1:8080/app/version
- http://127.0.0.1:8080/app/capabilities
- http://127.0.0.1:8080/app/route?from=46,1&to=47,2&type=duration&avoid=toll

3. Perform unit tests: 
```
docker exec -i -t pgr_node_1 grunt test
```

4. Cleanup Dev env
```
bash dev/down.sh
```
