(function() {
  var Promise, _, api, fileNameRe, path, pathRe, pathSepRe, pkg, stripPath, system, user;

  _ = require("lodash");

  Promise = require("bluebird");

  pkg = require("../../root");

  path = require("path");

  api = require("./api");

  user = require("./user");

  system = require("./util/system");

  pathRe = /'?((\/|\\+|[a-z]:\\)[^\s']+)+'?/ig;

  pathSepRe = /[\/\\]+/;

  fileNameRe = /[^\s'\/]+\.\w+:?\d*$/i;

  stripPath = function(text) {
    return (text || "").replace(pathRe, function(path) {
      var fileName;
      fileName = _.last(path.split(pathSepRe)) || "";
      return "<stripped-path>" + fileName;
    });
  };

  module.exports = {
    getErr: function(err) {
      return {
        name: stripPath(err.name),
        message: stripPath(err.message),
        stack: stripPath(err.stack)
      };
    },
    getVersion: function() {
      return pkg.version;
    },
    getBody: function(err) {
      return system.info().then((function(_this) {
        return function(systemInfo) {
          return _.extend({
            err: _this.getErr(err),
            version: _this.getVersion()
          }, systemInfo);
        };
      })(this));
    },
    getAuthToken: function() {
      return user.get().then(function(user) {
        return user && user.authToken;
      });
    },
    create: function(err) {
      if (process.env["CYPRESS_INTERNAL_ENV"] !== "production" || process.env["CYPRESS_CRASH_REPORTS"] === "0") {
        return Promise.resolve();
      }
      return Promise.join(this.getBody(err), this.getAuthToken()).spread(function(body, authToken) {
        return api.createCrashReport(body, authToken);
      });
    }
  };

}).call(this);
