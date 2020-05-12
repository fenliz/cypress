(function() {
  var CONFIG_DEFAULTS, CYPRESS_ENV_PREFIX, CYPRESS_ENV_PREFIX_LENGTH, CYPRESS_RESERVED_ENV_VARS, CYPRESS_SPECIAL_ENV_VARS, Promise, R, _, breakingConfigKeys, check, coerce, configKeys, convertRelativeToAbsolutePaths, dashesOrUnderscoresRe, debug, deepDiff, errors, everythingAfterFirstEqualRe, experimentalConfigKeys, findSystemNode, folders, fs, hideSpecialVals, isCypressEnvLike, keys, la, oneOrMoreSpacesRe, origin, path, pathHelpers, removeEnvPrefix, scaffold, settings, systemConfigKeys, toWords, v, validate, validateFile, validateNoBreakingConfig, validationRules;

  _ = require("lodash");

  R = require("ramda");

  la = require("lazy-ass");

  path = require("path");

  check = require("check-more-types");

  Promise = require("bluebird");

  deepDiff = require("return-deep-diff");

  errors = require("./errors");

  scaffold = require("./scaffold");

  fs = require("./util/fs");

  keys = require("./util/keys");

  origin = require("./util/origin");

  coerce = require("./util/coerce");

  settings = require("./util/settings");

  v = require("./util/validation");

  debug = require("debug")("cypress:server:config");

  pathHelpers = require("./util/path_helpers");

  findSystemNode = require("./util/find_system_node");

  CYPRESS_ENV_PREFIX = "CYPRESS_";

  CYPRESS_ENV_PREFIX_LENGTH = "CYPRESS_".length;

  CYPRESS_RESERVED_ENV_VARS = ["CYPRESS_INTERNAL_ENV"];

  CYPRESS_SPECIAL_ENV_VARS = ["CI_KEY", "RECORD_KEY"];

  dashesOrUnderscoresRe = /^(_-)+/;

  oneOrMoreSpacesRe = /\s+/;

  everythingAfterFirstEqualRe = /=(.+)/;

  toWords = function(str) {
    return str.trim().split(oneOrMoreSpacesRe);
  };

  isCypressEnvLike = function(key) {
    return _.chain(key).invoke('toUpperCase').startsWith(CYPRESS_ENV_PREFIX).value() && !_.includes(CYPRESS_RESERVED_ENV_VARS, key);
  };

  removeEnvPrefix = function(key) {
    return key.slice(CYPRESS_ENV_PREFIX_LENGTH);
  };

  folders = toWords("fileServerFolder   fixturesFolder   integrationFolder   pluginsFile\nscreenshotsFolder  supportFile      supportFolder       unitFolder\nvideosFolder");

  folders.push("componentFolder");

  configKeys = toWords("animationDistanceThreshold      fileServerFolder\nbaseUrl                         fixturesFolder\nblacklistHosts\nchromeWebSecurity\nmodifyObstructiveCode           integrationFolder\nenv                             pluginsFile\nhosts                           screenshotsFolder\nnumTestsKeptInMemory            supportFile\nport                            supportFolder\nprojectId                       videosFolder\nreporter\nreporterOptions\nignoreTestFiles\ntestFiles                       defaultCommandTimeout\ntrashAssetsBeforeRuns           execTimeout\nuserAgent                       pageLoadTimeout\nviewportWidth                   requestTimeout\nviewportHeight                  responseTimeout\nvideo                           taskTimeout\nvideoCompression\nvideoUploadOnPasses\nwatchForFileChanges\nwaitForAnimations               resolvedNodeVersion\nnodeVersion                     resolvedNodePath\nfirefoxGcInterval");

  configKeys.push("componentFolder");

  breakingConfigKeys = toWords("videoRecording\nscreenshotOnHeadlessFailure\ntrashAssetsBeforeHeadlessRuns");

  systemConfigKeys = toWords("browsers");

  experimentalConfigKeys = ['experimentalGetCookiesSameSite', 'experimentalSourceRewriting', 'experimentalComponentTesting'];

  CONFIG_DEFAULTS = {
    port: null,
    hosts: null,
    morgan: true,
    baseUrl: null,
    browsers: [],
    socketId: null,
    projectId: null,
    userAgent: null,
    isTextTerminal: false,
    reporter: "spec",
    reporterOptions: null,
    blacklistHosts: null,
    clientRoute: "/__/",
    xhrRoute: "/xhrs/",
    socketIoRoute: "/__socket.io",
    socketIoCookie: "__socket.io",
    reporterRoute: "/__cypress/reporter",
    ignoreTestFiles: "*.hot-update.js",
    testFiles: "**/*.*",
    defaultCommandTimeout: 4000,
    requestTimeout: 5000,
    responseTimeout: 30000,
    pageLoadTimeout: 60000,
    execTimeout: 60000,
    taskTimeout: 60000,
    video: true,
    videoCompression: 32,
    videoUploadOnPasses: true,
    modifyObstructiveCode: true,
    chromeWebSecurity: true,
    waitForAnimations: true,
    animationDistanceThreshold: 5,
    numTestsKeptInMemory: 50,
    watchForFileChanges: true,
    trashAssetsBeforeRuns: true,
    autoOpen: false,
    viewportWidth: 1000,
    viewportHeight: 660,
    fileServerFolder: "",
    videosFolder: "cypress/videos",
    supportFile: "cypress/support",
    fixturesFolder: "cypress/fixtures",
    integrationFolder: "cypress/integration",
    screenshotsFolder: "cypress/screenshots",
    namespace: "__cypress",
    pluginsFile: "cypress/plugins",
    nodeVersion: "default",
    configFile: "cypress.json",
    firefoxGcInterval: {
      runMode: 1,
      openMode: null
    },
    javascripts: [],
    experimentalComponentTesting: false,
    componentFolder: "cypress/component",
    experimentalGetCookiesSameSite: false,
    experimentalSourceRewriting: false
  };

  validationRules = {
    animationDistanceThreshold: v.isNumber,
    baseUrl: v.isFullyQualifiedUrl,
    blacklistHosts: v.isStringOrArrayOfStrings,
    browsers: v.isValidBrowserList,
    chromeWebSecurity: v.isBoolean,
    configFile: v.isStringOrFalse,
    defaultCommandTimeout: v.isNumber,
    env: v.isPlainObject,
    execTimeout: v.isNumber,
    fileServerFolder: v.isString,
    fixturesFolder: v.isStringOrFalse,
    ignoreTestFiles: v.isStringOrArrayOfStrings,
    integrationFolder: v.isString,
    modifyObstructiveCode: v.isBoolean,
    nodeVersion: v.isOneOf("default", "bundled", "system"),
    numTestsKeptInMemory: v.isNumber,
    pageLoadTimeout: v.isNumber,
    pluginsFile: v.isStringOrFalse,
    port: v.isNumber,
    reporter: v.isString,
    requestTimeout: v.isNumber,
    responseTimeout: v.isNumber,
    supportFile: v.isStringOrFalse,
    taskTimeout: v.isNumber,
    testFiles: v.isStringOrArrayOfStrings,
    trashAssetsBeforeRuns: v.isBoolean,
    userAgent: v.isString,
    video: v.isBoolean,
    videoCompression: v.isNumberOrFalse,
    videosFolder: v.isString,
    videoUploadOnPasses: v.isBoolean,
    viewportHeight: v.isNumber,
    viewportWidth: v.isNumber,
    waitForAnimations: v.isBoolean,
    watchForFileChanges: v.isBoolean,
    firefoxGcInterval: v.isValidFirefoxGcInterval,
    experimentalComponentTesting: v.isBoolean,
    componentFolder: v.isStringOrFalse,
    experimentalGetCookiesSameSite: v.isBoolean,
    experimentalSourceRewriting: v.isBoolean
  };

  convertRelativeToAbsolutePaths = function(projectRoot, obj, defaults) {
    if (defaults == null) {
      defaults = {};
    }
    return _.reduce(folders, function(memo, folder) {
      var val;
      val = obj[folder];
      if ((val != null) && val !== false) {
        memo[folder] = path.resolve(projectRoot, val);
      }
      return memo;
    }, {});
  };

  validateNoBreakingConfig = function(cfg) {
    return _.each(breakingConfigKeys, function(key) {
      if (_.has(cfg, key)) {
        switch (key) {
          case "screenshotOnHeadlessFailure":
            return errors["throw"]("SCREENSHOT_ON_HEADLESS_FAILURE_REMOVED");
          case "trashAssetsBeforeHeadlessRuns":
            return errors["throw"]("RENAMED_CONFIG_OPTION", key, "trashAssetsBeforeRuns");
          case "videoRecording":
            return errors["throw"]("RENAMED_CONFIG_OPTION", key, "video");
        }
      }
    });
  };

  validate = function(cfg, onErr) {
    return _.each(cfg, function(value, key) {
      var result, validationFn;
      if (validationFn = validationRules[key]) {
        if (value !== CONFIG_DEFAULTS[key]) {
          result = validationFn(key, value);
          if (result !== true) {
            return onErr(result);
          }
        }
      }
    });
  };

  validateFile = function(file) {
    return function(settings) {
      return validate(settings, function(errMsg) {
        return errors["throw"]("SETTINGS_VALIDATION_ERROR", file, errMsg);
      });
    };
  };

  hideSpecialVals = function(val, key) {
    if (_.includes(CYPRESS_SPECIAL_ENV_VARS, key)) {
      return keys.hide(val);
    }
    return val;
  };

  module.exports = {
    getConfigKeys: function() {
      return configKeys.concat(experimentalConfigKeys);
    },
    isValidCypressInternalEnvValue: function(value) {
      var names;
      names = ["development", "test", "staging", "production"];
      return _.includes(names, value);
    },
    whitelist: function(obj) {
      var propertyNames;
      if (obj == null) {
        obj = {};
      }
      propertyNames = configKeys.concat(breakingConfigKeys).concat(systemConfigKeys).concat(experimentalConfigKeys);
      return _.pick(obj, propertyNames);
    },
    get: function(projectRoot, options) {
      if (options == null) {
        options = {};
      }
      return Promise.all([settings.read(projectRoot, options).then(validateFile("cypress.json")), settings.readEnv(projectRoot).then(validateFile("cypress.env.json"))]).spread((function(_this) {
        return function(settings, envFile) {
          return _this.set({
            projectName: _this.getNameFromRoot(projectRoot),
            projectRoot: projectRoot,
            config: settings,
            envFile: envFile,
            options: options
          });
        };
      })(this));
    },
    set: function(obj) {
      var config, envFile, options, projectName, projectRoot;
      if (obj == null) {
        obj = {};
      }
      debug("setting config object");
      projectRoot = obj.projectRoot, projectName = obj.projectName, config = obj.config, envFile = obj.envFile, options = obj.options;
      if (config == null) {
        config = {};
      }
      debug("config is %o", config);
      config.envFile = envFile;
      config.projectRoot = projectRoot;
      config.projectName = projectName;
      return this.mergeDefaults(config, options);
    },
    mergeDefaults: function(config, options) {
      var resolved, url;
      if (config == null) {
        config = {};
      }
      if (options == null) {
        options = {};
      }
      resolved = {};
      _.extend(config, _.pick(options, "configFile", "morgan", "isTextTerminal", "socketId", "report", "browsers"));
      debug("merged config with options, got %o", config);
      _.chain(this.whitelist(options)).omit("env").omit("browsers").each(function(val, key) {
        resolved[key] = "cli";
        config[key] = val;
      }).value();
      if (url = config.baseUrl) {
        config.baseUrl = url.replace(/\/\/+$/, "/");
      }
      _.defaults(config, CONFIG_DEFAULTS);
      config.env = this.parseEnv(config, options.env, resolved);
      config.cypressEnv = process.env["CYPRESS_INTERNAL_ENV"];
      debug("using CYPRESS_INTERNAL_ENV %s", config.cypressEnv);
      if (!this.isValidCypressInternalEnvValue(config.cypressEnv)) {
        errors["throw"]("INVALID_CYPRESS_INTERNAL_ENV", config.cypressEnv);
      }
      delete config.envFile;
      if (config.isTextTerminal && !process.env.CYPRESS_INTERNAL_FORCE_FILEWATCH) {
        config.watchForFileChanges = false;
        config.numTestsKeptInMemory = 0;
      }
      config = this.setResolvedConfigValues(config, CONFIG_DEFAULTS, resolved);
      if (config.port) {
        config = this.setUrls(config);
      }
      config = this.setAbsolutePaths(config, CONFIG_DEFAULTS);
      config = this.setParentTestsPaths(config);
      validate(config, function(errMsg) {
        return errors["throw"]("CONFIG_VALIDATION_ERROR", errMsg);
      });
      validateNoBreakingConfig(config);
      return this.setSupportFileAndFolder(config).then(this.setPluginsFile).then(this.setScaffoldPaths).then(_.partialRight(this.setNodeBinary, options.onWarning));
    },
    setResolvedConfigValues: function(config, defaults, resolved) {
      var obj;
      obj = _.clone(config);
      obj.resolved = this.resolveConfigValues(config, defaults, resolved);
      debug("resolved config is %o", obj.resolved.browsers);
      return obj;
    },
    setPluginResolvedOn: function(resolvedObj, obj) {
      return _.each(obj, (function(_this) {
        return function(val, key) {
          if (_.isObject(val) && !_.isArray(val)) {
            return _this.setPluginResolvedOn(resolvedObj[key], val);
          } else {
            return resolvedObj[key] = {
              value: val,
              from: "plugin"
            };
          }
        };
      })(this));
    },
    updateWithPluginValues: function(cfg, overrides) {
      var diffs, merged, originalResolvedBrowsers, userBrowserList;
      if (overrides == null) {
        overrides = {};
      }
      debug("starting config %o", cfg);
      debug("overrides %o", overrides);
      validate(overrides, function(errMsg) {
        var relativePluginsPath;
        if (cfg.pluginsFile && cfg.projectRoot) {
          relativePluginsPath = path.relative(cfg.projectRoot, cfg.pluginsFile);
          return errors["throw"]("PLUGINS_CONFIG_VALIDATION_ERROR", relativePluginsPath, errMsg);
        } else {
          return errors["throw"]("CONFIG_VALIDATION_ERROR", errMsg);
        }
      });
      originalResolvedBrowsers = cfg && cfg.resolved && cfg.resolved.browsers && R.clone(cfg.resolved.browsers);
      if (!originalResolvedBrowsers) {
        originalResolvedBrowsers = {
          value: cfg.browsers,
          from: "default"
        };
      }
      diffs = deepDiff(cfg, overrides, true);
      debug("config diffs %o", diffs);
      userBrowserList = diffs && diffs.browsers && R.clone(diffs.browsers);
      if (userBrowserList) {
        debug("user browser list %o", userBrowserList);
      }
      if (diffs) {
        debug("resolved config before diffs %o", cfg.resolved);
        this.setPluginResolvedOn(cfg.resolved, diffs);
        debug("resolved config object %o", cfg.resolved);
      }
      merged = _.defaultsDeep(diffs, cfg);
      debug("merged config object %o", merged);
      if (Array.isArray(userBrowserList) && userBrowserList.length) {
        merged.browsers = userBrowserList;
        merged.resolved.browsers.value = userBrowserList;
      }
      if (overrides.browsers === null) {
        debug("replacing null browsers with original list %o", originalResolvedBrowsers);
        merged.browsers = cfg.browsers;
        if (originalResolvedBrowsers) {
          merged.resolved.browsers = originalResolvedBrowsers;
        }
      }
      debug("merged plugins config %o", merged);
      return merged;
    },
    resolveConfigValues: function(config, defaults, resolved) {
      if (resolved == null) {
        resolved = {};
      }
      return _.chain(config).pick(configKeys.concat(systemConfigKeys).concat(experimentalConfigKeys)).mapValues(function(val, key) {
        var r, source;
        source = function(s) {
          return {
            value: val,
            from: s
          };
        };
        switch (false) {
          case !(r = resolved[key]):
            if (_.isObject(r)) {
              return r;
            } else {
              return source(r);
            }
            break;
          case !(_.isEqual(config[key], defaults[key]) || key === "browsers"):
            return source("default");
          default:
            return source("config");
        }
      }).value();
    },
    setNodeBinary: Promise.method(function(obj, onWarning) {
      if (obj.nodeVersion !== 'system') {
        obj.resolvedNodeVersion = process.versions.node;
        return obj;
      }
      return findSystemNode.findNodePathAndVersion().then(function(arg) {
        var path, version;
        path = arg.path, version = arg.version;
        obj.resolvedNodePath = path;
        return obj.resolvedNodeVersion = version;
      })["catch"](function(err) {
        onWarning(errors.get('COULD_NOT_FIND_SYSTEM_NODE', process.versions.node));
        return obj.resolvedNodeVersion = process.versions.node;
      })["return"](obj);
    }),
    setScaffoldPaths: function(obj) {
      obj = _.clone(obj);
      obj.integrationExampleName = scaffold.integrationExampleName();
      obj.integrationExamplePath = path.join(obj.integrationFolder, obj.integrationExampleName);
      debug("set scaffold paths");
      return scaffold.fileTree(obj).then(function(fileTree) {
        debug("got file tree");
        obj.scaffoldedFiles = fileTree;
        return obj;
      });
    },
    setSupportFileAndFolder: function(obj) {
      var sf;
      if (!obj.supportFile) {
        return Promise.resolve(obj);
      }
      obj = _.clone(obj);
      sf = obj.supportFile;
      debug("setting support file " + sf);
      debug("for project root " + obj.projectRoot);
      return Promise["try"](function() {
        return obj.supportFile = require.resolve(sf);
      }).then(function() {
        if (pathHelpers.checkIfResolveChangedRootFolder(obj.supportFile, sf)) {
          debug("require.resolve switched support folder from %s to %s", sf, obj.supportFile);
          obj.supportFile = path.join(sf, path.basename(obj.supportFile));
          return fs.pathExists(obj.supportFile).then(function(found) {
            if (!found) {
              errors["throw"]("SUPPORT_FILE_NOT_FOUND", obj.supportFile, obj.configFile || CONFIG_DEFAULTS.configFile);
            }
            return debug("switching to found file %s", obj.supportFile);
          });
        }
      })["catch"]({
        code: "MODULE_NOT_FOUND"
      }, function() {
        debug("support file %s does not exist", sf);
        if (sf === path.resolve(obj.projectRoot, CONFIG_DEFAULTS.supportFile)) {
          debug("support file is default, check if " + (path.dirname(sf)) + " exists");
          return fs.pathExists(sf).then(function(found) {
            if (found) {
              debug("support folder exists, set supportFile to false");
              obj.supportFile = false;
            } else {
              debug("support folder does not exist, set to default index.js");
              obj.supportFile = path.join(sf, "index.js");
            }
            return obj;
          });
        } else {
          debug("support file is not default");
          return errors["throw"]("SUPPORT_FILE_NOT_FOUND", path.resolve(obj.projectRoot, sf), obj.configFile || CONFIG_DEFAULTS.configFile);
        }
      }).then(function() {
        if (obj.supportFile) {
          obj.supportFolder = path.dirname(obj.supportFile);
          debug("set support folder " + obj.supportFolder);
        }
        return obj;
      });
    },
    setPluginsFile: Promise.method(function(obj) {
      var pluginsFile;
      if (!obj.pluginsFile) {
        return obj;
      }
      obj = _.clone(obj);
      pluginsFile = obj.pluginsFile;
      debug("setting plugins file " + pluginsFile);
      debug("for project root " + obj.projectRoot);
      return Promise["try"](function() {
        obj.pluginsFile = require.resolve(pluginsFile);
        return debug("set pluginsFile to " + obj.pluginsFile);
      })["catch"]({
        code: "MODULE_NOT_FOUND"
      }, function() {
        debug("plugins file does not exist");
        if (pluginsFile === path.resolve(obj.projectRoot, CONFIG_DEFAULTS.pluginsFile)) {
          debug("plugins file is default, check if " + (path.dirname(pluginsFile)) + " exists");
          return fs.pathExists(pluginsFile).then(function(found) {
            if (found) {
              debug("plugins folder exists, set pluginsFile to false");
              obj.pluginsFile = false;
            } else {
              debug("plugins folder does not exist, set to default index.js");
              obj.pluginsFile = path.join(pluginsFile, "index.js");
            }
            return obj;
          });
        } else {
          debug("plugins file is not default");
          return errors["throw"]("PLUGINS_FILE_ERROR", path.resolve(obj.projectRoot, pluginsFile));
        }
      })["return"](obj);
    }),
    setParentTestsPaths: function(obj) {
      var prd, ptfd, ref;
      obj = _.clone(obj);
      ptfd = obj.parentTestsFolder = path.dirname(obj.integrationFolder);
      prd = path.dirname((ref = obj.projectRoot) != null ? ref : "");
      obj.parentTestsFolderDisplay = path.relative(prd, ptfd);
      return obj;
    },
    setAbsolutePaths: function(obj, defaults) {
      var pr;
      obj = _.clone(obj);
      if (pr = obj.projectRoot) {
        _.extend(obj, convertRelativeToAbsolutePaths(pr, obj, defaults));
      }
      return obj;
    },
    setUrls: function(obj) {
      var proxyUrl, rootUrl;
      obj = _.clone(obj);
      proxyUrl = "http://localhost:" + obj.port;
      rootUrl = obj.baseUrl ? origin(obj.baseUrl) : proxyUrl;
      _.extend(obj, {
        proxyUrl: proxyUrl,
        browserUrl: rootUrl + obj.clientRoute,
        reporterUrl: rootUrl + obj.reporterRoute,
        xhrUrl: obj.namespace + obj.xhrRoute
      });
      return obj;
    },
    parseEnv: function(cfg, envCLI, resolved) {
      var configFromEnv, envCfg, envFile, envProc, envVars, matchesConfigKey, ref, ref1, ref2, resolveFrom;
      if (resolved == null) {
        resolved = {};
      }
      envVars = resolved.env = {};
      resolveFrom = function(from, obj) {
        if (obj == null) {
          obj = {};
        }
        return _.each(obj, function(val, key) {
          return envVars[key] = {
            value: val,
            from: from
          };
        });
      };
      envCfg = (ref = cfg.env) != null ? ref : {};
      envFile = (ref1 = cfg.envFile) != null ? ref1 : {};
      envProc = (ref2 = this.getProcessEnvVars(process.env)) != null ? ref2 : {};
      envCLI = envCLI != null ? envCLI : {};
      matchesConfigKey = function(key) {
        if (_.has(CONFIG_DEFAULTS, key)) {
          return key;
        }
        key = key.toLowerCase().replace(dashesOrUnderscoresRe, "");
        key = _.camelCase(key);
        if (_.has(CONFIG_DEFAULTS, key)) {
          return key;
        }
      };
      configFromEnv = _.reduce(envProc, function(memo, val, key) {
        var cfgKey;
        if (cfgKey = matchesConfigKey(key)) {
          if (resolved[cfgKey] !== "cli") {
            cfg[cfgKey] = val;
            resolved[cfgKey] = {
              value: val,
              from: "env"
            };
          }
          memo.push(key);
        }
        return memo;
      }, []);
      envProc = _.chain(envProc).omit(configFromEnv).mapValues(hideSpecialVals).value();
      resolveFrom("config", envCfg);
      resolveFrom("envFile", envFile);
      resolveFrom("env", envProc);
      resolveFrom("cli", envCLI);
      return _.extend(envCfg, envFile, envProc, envCLI);
    },
    getProcessEnvVars: function(obj) {
      if (obj == null) {
        obj = {};
      }
      return _.reduce(obj, function(memo, value, key) {
        if (isCypressEnvLike(key)) {
          memo[removeEnvPrefix(key)] = coerce(value);
        }
        return memo;
      }, {});
    },
    getNameFromRoot: function(root) {
      if (root == null) {
        root = "";
      }
      return path.basename(root);
    }
  };

}).call(this);
