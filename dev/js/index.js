const express = require('express');
const app = express();
const routeApp = require('./route');

app.use('/app',routeApp());

app.use(express.static('dev/static'))
app.use("/data", express.static('dev/data'))

app.listen(8080,function(){
	console.log('Listen on 0.0.0.0:8080')
})