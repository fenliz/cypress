(function() {
  var Promise, _, check, coffee, cwd, debug, errors, extensions, friendlyJsonParse, fs, glob, jsonlint, lastCharacterIsNewLine, path, queue;

  _ = require("lodash");

  path = require("path");

  check = require("syntax-error");

  debug = require("debug")("cypress:server:fixture");

  coffee = require("../../../packages/coffee");

  Promise = require("bluebird");

  jsonlint = require("jsonlint");

  cwd = require("./cwd");

  errors = require("./errors");

  fs = require("./util/fs");

  glob = require("./util/glob");

  extensions = [".json", ".js", ".coffee", ".html", ".txt", ".csv", ".png", ".jpg", ".jpeg", ".gif", ".tif", ".tiff", ".zip"];

  queue = {};

  lastCharacterIsNewLine = function(str) {
    return str[str.length - 1] === "\n";
  };

  friendlyJsonParse = function(s) {
    jsonlint.parse(s);
    return JSON.parse(s);
  };

  module.exports = {
    get: function(fixturesFolder, filePath, options) {
      var fixture, p;
      if (options == null) {
        options = {};
      }
      p = path.join(fixturesFolder, filePath);
      fixture = path.basename(p);
      return this.fileExists(p).then(function() {
        var ext;
        debug("fixture exact name exists", p);
        ext = path.extname(fixture);
        return this.parseFile(p, fixture, options);
      })["catch"](function(e) {
        var pattern;
        if (e.code !== "ENOENT") {
          throw e;
        }
        pattern = p + "{" + (extensions.join(",")) + "}";
        return glob(pattern, {
          nosort: true,
          nodir: true
        }).bind(this).then(function(matches) {
          var ext, relativePath;
          if (matches.length === 0) {
            relativePath = path.relative('.', p);
            errors["throw"]("FIXTURE_NOT_FOUND", relativePath, extensions);
          }
          debug("fixture matches found, using the first", matches);
          ext = path.extname(matches[0]);
          return this.parseFile(p + ext, fixture, options);
        });
      });
    },
    fileExists: function(p) {
      return fs.statAsync(p).bind(this).then(function(stat) {
        var err;
        if (stat.isDirectory()) {
          err = new Error();
          err.code = "ENOENT";
          throw err;
        }
      });
    },
    parseFile: function(p, fixture, options) {
      var cleanup;
      if (queue[p]) {
        return Promise.delay(1).then((function(_this) {
          return function() {
            return _this.parseFile(p, fixture, options);
          };
        })(this));
      } else {
        queue[p] = true;
        cleanup = function() {
          return delete queue[p];
        };
        return this.fileExists(p).then(function() {
          var ext;
          ext = path.extname(p);
          return this.parseFileByExtension(p, fixture, ext, options);
        }).then(function(ret) {
          cleanup();
          return ret;
        })["catch"](function(err) {
          cleanup();
          throw err;
        });
      }
    },
    parseFileByExtension: function(p, fixture, ext, options) {
      if (options == null) {
        options = {};
      }
      switch (ext) {
        case ".json":
          return this.parseJson(p, fixture);
        case ".js":
          return this.parseJs(p, fixture);
        case ".coffee":
          return this.parseCoffee(p, fixture);
        case ".html":
          return this.parseHtml(p, fixture);
        case ".png":
        case ".jpg":
        case ".jpeg":
        case ".gif":
        case ".tif":
        case ".tiff":
        case ".zip":
          return this.parse(p, fixture, options.encoding || "base64");
        default:
          return this.parse(p, fixture, options.encoding);
      }
    },
    parseJson: function(p, fixture) {
      return fs.readFileAsync(p, "utf8").bind(this).then(friendlyJsonParse)["catch"](function(err) {
        throw new Error("'" + fixture + "' is not valid JSON.\n" + err.message);
      });
    },
    parseJs: function(p, fixture) {
      return fs.readFileAsync(p, "utf8").bind(this).then(function(str) {
        var e, err, obj;
        try {
          obj = eval("(" + str + ")");
        } catch (error) {
          e = error;
          err = check(str, fixture);
          if (err) {
            throw err;
          }
          throw e;
        }
        return obj;
      })["catch"](function(err) {
        throw new Error("'" + fixture + "' is not a valid JavaScript object." + (err.toString()));
      });
    },
    parseCoffee: function(p, fixture) {
      var dc;
      dc = process.env.NODE_DISABLE_COLORS;
      process.env.NODE_DISABLE_COLORS = "0";
      return fs.readFileAsync(p, "utf8").bind(this).then(function(str) {
        str = coffee.compile(str, {
          bare: true
        });
        return eval(str);
      })["catch"](function(err) {
        throw new Error("'" + fixture + " is not a valid CoffeeScript object.\n" + (err.toString()));
      })["finally"](function() {
        return process.env.NODE_DISABLE_COLORS = dc;
      });
    },
    parseHtml: function(p, fixture) {
      return fs.readFileAsync(p, "utf8").bind(this);
    },
    parse: function(p, fixture, encoding) {
      if (encoding == null) {
        encoding = "utf8";
      }
      return fs.readFileAsync(p, encoding).bind(this);
    }
  };

}).call(this);
