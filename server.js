var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
var edge = require('edge');
var edgesql = require('edge-sql');
var ping = require('ping');
var request = require('request');
var parseString = require('xml2js').parseString;
var env = require('node-env-file');
var fs = require('fs');

if (fs.exists(__dirname + '\\.env')){
    env(__dirname + '\\.env');
}

var port = process.env.port || 1337;
var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

// error handler
app.use(function (err, req, res, next) {
    console.error(err.stack);
    res.status(200).send({
        text: err.message + err.stack
    });
});

app.set('port', port);

var query_GetSupplier = edge.func('sql', function () {
    /*
     SELECT Code, FirstName, Active FROM dbo.Supplier WHERE Code = @code
     */
});

var query_EnableSupplier = edge.func('sql', function () {
    /*
     UPDATE dbo.Supplier SET Active = 1 WHERE Code = @code 
     */
});


function getSupplier(suppCode, botPayload, res) {
    query_GetSupplier({ code: suppCode }, function (error, result) {
        if (error) {
            console.log(error);
            throw error;
        }
        console.log(result);
        botPayload.text = 'Supplier ' + result[0].Code + ((result[0].Active === '0') ? ' not' : '') + ' active.';
        res.status(200).json(botPayload);
    });
}

app.get('/checktest', function (req, res) {
    var constring = process.env.EDGE_SQL_CONNECTION_STRING;
    var str = 'Hello\n';
    str += '\nSQL = ' + constring.substring(0, constring.indexOf('Source'));
    str += '\nEdge = ' + typeof (edge);
    str += '\nBody Parser = ' + typeof (bodyParser);
    str += '\nquery_GetSupplier = ' + typeof (query_GetSupplier);
    res.end('OK');
});

app.get('/', function (req, res) {

    res.end('OK');
});

app.post('/msgreceived', function (req, res) {

    var sender = req.body.sender;
    var txt = req.body.text;
    var code = txt.split(' ')[1];

    queryProducts(code, function (msg) {
        var TMClient = require('textmagic-rest-client');
        var sms = new TMClient(process.env.TEXTMAGIC_USER, process.env.TEXTMAGIC_PASS);

        sms.Messages.send({ text: msg, phones: sender }, function (err, result) {
            if (err) throw err;
            res.status(200).json(result);
        });

    });

});

app.post('/talk', function (req, res) {

    var args = req.body.text.split(' ');
    var token = req.body.token;
    var init = args[0];
    var cmd = args[1];
    var opt1 = args[2];

    var botPayload = {
        text: ''
    };

    try {
        if (token == process.env.SLACK_TOKEN) {

            switch (cmd) {
                case "hello":
                    {
                        botPayload.text = 'Hello, ' + req.body.user_name;
                        res.status(200).json(botPayload);
                        break;
                    }

                case "enable-supplier":
                    {
                        query_EnableSupplier({ customercode: opt1 }, function (error, result) {
                            if (error) throw error;
                            getSupplier(opt1, botPayload, res);
                        });
                        break;
                    }
                case "get-supplier":
                    {
                        getSupplier(opt1, botPayload, res);
                        break;
                    }
                case "query-products":
                    {
                        queryProducts(opt1, function (msg) {
                            botPayload.text = msg;
                            res.status(200).json(botPayload);
                        });
                        break;
                    }
                case "query-images":
                    {
                        getImageCount({ inputSku: opt1 }, function (error, result) {
                            if (error) throw error;

                            var paths = '';
                            for (var i = 0; i < result.length; i++) {
                                paths += '\n' + result[i].path;
                            }

                            botPayload.text = 'Found ' + result.length.toString() + ' result(s)' + paths;
                            res.status(200).json(botPayload);
                        });
                        break;
                    }
                default:
                    {
                        botPayload.text = JSON.stringify(req.body);
                        res.status(200).json(botPayload);
                        break;
                    }
            }

        }
        else {
            botPayload.text = 'No auth cheeky monkey';
            res.status(200).json(botPayload);
        }
    }
    catch (err) {
        botPayload.text = err;
        res.status(200).json(botPayload);
    }
});

app.listen(app.get('port'), function () {

});


function queryProducts(searchTerm, done) {

    var aws = require("aws-lib");
    var papiAccessKeyId = process.env.PAPI_ACCESSKEY_ID;
    var papiSecretAccessKey = process.env.PAPI_SECRECT_ACCESSKEY;
    var papiAssociateTag = "";

    var prodAdv = aws.createProdAdvClient(papiAccessKeyId, papiSecretAccessKey, papiAssociateTag);

    var options = {SearchIndex: "Books", Keywords: searchTerm}

    prodAdv.call("ItemSearch", options, function(err, result) {
        if (err) throw err;
        console.log(result);
        var retMsg = 'Found ' + result.Items.length + ' item(s)';
        done(retMsg);      
    });
}