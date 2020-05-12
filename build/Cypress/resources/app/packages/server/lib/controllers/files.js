(function() {
  var CacheBuster, Promise, R, SPEC_URL_PREFIX, _, cwd, debug, escapeFilenameInUrl, glob, path, pathHelpers, specsUtil;

  _ = require("lodash");

  R = require("ramda");

  path = require("path");

  Promise = require("bluebird");

  cwd = require("../cwd");

  glob = require("../util/glob");

  specsUtil = require("../util/specs");

  pathHelpers = require("../util/path_helpers");

  CacheBuster = require("../util/cache_buster");

  debug = require("debug")("cypress:server:controllers");

  escapeFilenameInUrl = require('../util/escape_filename').escapeFilenameInUrl;

  SPEC_URL_PREFIX = "/__cypress/tests?p";

  module.exports = {
    handleFiles: function(req, res, config) {
      debug("handle files");
      return specsUtil.find(config).then(function(files) {
        return res.json({
          integration: files
        });
      });
    },
    handleIframe: function(req, res, config, getRemoteState) {
      var iframePath, test;
      test = req.params[0];
      iframePath = cwd("lib", "html", "iframe.html");
      debug("handle iframe %o", {
        test: test
      });
      return this.getSpecs(test, config).then((function(_this) {
        return function(specs) {
          return _this.getJavascripts(config).then(function(js) {
            var iframeOptions;
            iframeOptions = {
              title: _this.getTitle(test),
              domain: getRemoteState().domainName,
              scripts: JSON.stringify(js.concat(specs))
            };
            debug("iframe %s options %o", test, iframeOptions);
            return res.render(iframePath, iframeOptions);
          });
        };
      })(this));
    },
    getSpecs: function(spec, config) {
      var convertSpecPath, getSpecsHelper;
      debug("get specs %o", {
        spec: spec
      });
      convertSpecPath = (function(_this) {
        return function(spec) {
          var convertedSpec;
          convertedSpec = pathHelpers.getAbsolutePathToSpec(spec, config);
          debug("converted %s to %s", spec, convertedSpec);
          return _this.prepareForBrowser(convertedSpec, config.projectRoot);
        };
      })(this);
      getSpecsHelper = (function(_this) {
        return function() {
          var experimentalComponentTestingEnabled;
          experimentalComponentTestingEnabled = _.get(config, 'resolved.experimentalComponentTesting.value', false);
          if (spec === "__all") {
            return specsUtil.find(config).then(R.tap(function(specs) {
              return debug("found __all specs %o", specs);
            })).filter(function(spec) {
              if (experimentalComponentTestingEnabled) {
                return spec.specType === "integration";
              } else {
                return true;
              }
            }).then(R.tap(function(specs) {
              return debug("filtered __all specs %o", specs);
            })).map(function(spec) {
              return spec.absolute;
            }).map(convertSpecPath);
          } else {
            return [convertSpecPath(spec)];
          }
        };
      })(this);
      return Promise["try"]((function(_this) {
        return function() {
          return getSpecsHelper();
        };
      })(this));
    },
    prepareForBrowser: function(filePath, projectRoot) {
      var relativeFilePath;
      filePath = filePath.replace(SPEC_URL_PREFIX, "__CYPRESS_SPEC_URL_PREFIX__");
      filePath = escapeFilenameInUrl(filePath).replace("__CYPRESS_SPEC_URL_PREFIX__", SPEC_URL_PREFIX);
      relativeFilePath = path.relative(projectRoot, filePath);
      return {
        absolute: filePath,
        relative: relativeFilePath,
        relativeUrl: this.getTestUrl(relativeFilePath)
      };
    },
    getTestUrl: function(file) {
      var url;
      url = SPEC_URL_PREFIX + "=" + file;
      debug("test url for file %o", {
        file: file,
        url: url
      });
      return url;
    },
    getTitle: function(test) {
      if (test === "__all") {
        return "All Tests";
      } else {
        return test;
      }
    },
    getJavascripts: function(config) {
      var files, javascripts, paths, projectRoot, supportFile;
      projectRoot = config.projectRoot, supportFile = config.supportFile, javascripts = config.javascripts;
      files = [].concat(javascripts);
      if (supportFile !== false) {
        files = [supportFile].concat(files);
      }
      paths = _.map(files, function(file) {
        return path.resolve(projectRoot, file);
      });
      return Promise.map(paths, function(p) {
        if (!glob.hasMagic(p)) {
          return p;
        }
        p = path.resolve(projectRoot, p);
        return glob(p, {
          nodir: true
        });
      }).then(_.flatten).map((function(_this) {
        return function(filePath) {
          return _this.prepareForBrowser(filePath, projectRoot);
        };
      })(this));
    }
  };

}).call(this);
