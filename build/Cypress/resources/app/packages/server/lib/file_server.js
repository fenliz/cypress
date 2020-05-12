(function() {
  var _, allowDestroy, debug, errors, http, networkFailures, onRequest, path, random, send, url;

  _ = require("lodash");

  debug = require("debug")("cypress:server:file_server");

  url = require("url");

  http = require("http");

  path = require("path");

  send = require("send");

  errors = require("./errors");

  allowDestroy = require("./util/server_destroy");

  random = require("./util/random");

  networkFailures = require("./util/network_failures");

  onRequest = function(req, res, expectedToken, fileServerFolder) {
    var args, file, token;
    token = req.headers['x-cypress-authorization'];
    if (token !== expectedToken) {
      debug('authorization failed on file_server request %o', {
        reqUrl: req.url,
        expectedToken: expectedToken,
        token: token
      });
      res.statusCode = 401;
      res.end();
      return;
    }
    args = _.compact([fileServerFolder, req.url]);
    file = decodeURI(url.parse(path.join.apply(path, args)).pathname);
    res.setHeader("x-cypress-file-path", file);
    return send(req, url.parse(req.url).pathname, {
      root: path.resolve(fileServerFolder)
    }).on("error", function(err) {
      res.setHeader("x-cypress-file-server-error", true);
      res.setHeader("content-type", "text/html");
      res.statusCode = err.status;
      return res.end(networkFailures.get(file, err.status));
    }).pipe(res);
  };

  module.exports = {
    create: function(fileServerFolder) {
      return new Promise(function(resolve) {
        var srv, token;
        token = random.id(64);
        srv = http.createServer(function(req, res) {
          return onRequest(req, res, token, fileServerFolder);
        });
        allowDestroy(srv);
        return srv.listen(0, '127.0.0.1', function() {
          return resolve({
            token: token,
            port: function() {
              return srv.address().port;
            },
            address: function() {
              return "http://localhost:" + this.port();
            },
            close: function() {
              return srv.destroyAsync();
            }
          });
        });
      });
    }
  };

}).call(this);
