(function() {
  var API, EE, Promise, _, appData, baseEmitter, clientSideError, createBrowserifyPreprocessor, cwd, debug, errorMessage, fileObjects, fileProcessors, path, plugins, resolve, setDefaultPreprocessor;

  _ = require("lodash");

  EE = require("events");

  path = require("path");

  debug = require("debug")("cypress:server:preprocessor");

  Promise = require("bluebird");

  appData = require("../util/app_data");

  cwd = require("../cwd");

  plugins = require("../plugins");

  resolve = require("./resolve");

  errorMessage = function(err) {
    var ref, ref1, ref2;
    if (err == null) {
      err = {};
    }
    return ((ref = (ref1 = (ref2 = err.stack) != null ? ref2 : err.annotated) != null ? ref1 : err.message) != null ? ref : err.toString()).replace(/\n\s*at.*/g, "").replace(/From previous event:\n?/g, "");
  };

  clientSideError = function(err) {
    console.log(err.message);
    err = errorMessage(err);
    return "(function () {\n  Cypress.action(\"spec:script:error\", {\n    type: \"BUNDLE_ERROR\",\n    error: " + (JSON.stringify(err)) + "\n  })\n}())";
  };

  baseEmitter = new EE();

  fileObjects = {};

  fileProcessors = {};

  createBrowserifyPreprocessor = function(options) {
    var browserify;
    debug("creating browserify preprocessor with options %o", options);
    browserify = require("@cypress/browserify-preprocessor");
    return browserify(options);
  };

  setDefaultPreprocessor = function(config) {
    var options, tsPath;
    debug("set default preprocessor");
    tsPath = resolve.typescript(config);
    options = {
      typescript: tsPath
    };
    return plugins.register("file:preprocessor", API.createBrowserifyPreprocessor(options));
  };

  plugins.registerHandler(function(ipc) {
    ipc.on("preprocessor:rerun", function(filePath) {
      debug("ipc preprocessor:rerun event");
      return baseEmitter.emit("file:updated", filePath);
    });
    return baseEmitter.on("close", function(filePath) {
      debug("base emitter plugin close event");
      return ipc.send("preprocessor:close", filePath);
    });
  });

  API = {
    errorMessage: errorMessage,
    clientSideError: clientSideError,
    setDefaultPreprocessor: setDefaultPreprocessor,
    createBrowserifyPreprocessor: createBrowserifyPreprocessor,
    emitter: baseEmitter,
    getFile: function(filePath, config) {
      var baseFilePath, fileObject, fileProcessor, preprocessor, shouldWatch;
      debug("getting file " + filePath);
      filePath = path.resolve(config.projectRoot, filePath);
      debug("getFile " + filePath);
      if (!(fileObject = fileObjects[filePath])) {
        shouldWatch = !config.isTextTerminal || Boolean(process.env.CYPRESS_INTERNAL_FORCE_FILEWATCH);
        baseFilePath = filePath.replace(config.projectRoot, "").replace(config.integrationFolder, "");
        fileObject = fileObjects[filePath] = _.extend(new EE(), {
          filePath: filePath,
          shouldWatch: shouldWatch,
          outputPath: appData.getBundledFilePath(config.projectRoot, baseFilePath)
        });
        fileObject.on("rerun", function() {
          debug("file object rerun event");
          return baseEmitter.emit("file:updated", filePath);
        });
        baseEmitter.once("close", function() {
          debug("base emitter native close event");
          return fileObject.emit("close");
        });
      }
      if (!plugins.has("file:preprocessor")) {
        setDefaultPreprocessor(config);
      }
      if (config.isTextTerminal && (fileProcessor = fileProcessors[filePath])) {
        debug("headless and already processed");
        return fileProcessor;
      }
      preprocessor = fileProcessors[filePath] = Promise["try"](function() {
        return plugins.execute("file:preprocessor", fileObject);
      });
      return preprocessor;
    },
    removeFile: function(filePath, config) {
      var fileObject;
      filePath = path.resolve(config.projectRoot, filePath);
      if (!fileProcessors[filePath]) {
        return;
      }
      debug("removeFile " + filePath);
      baseEmitter.emit("close", filePath);
      if (fileObject = fileObjects[filePath]) {
        fileObject.emit("close");
      }
      delete fileObjects[filePath];
      return delete fileProcessors[filePath];
    },
    close: function() {
      debug("close preprocessor");
      fileObjects = {};
      fileProcessors = {};
      baseEmitter.emit("close");
      return baseEmitter.removeAllListeners();
    }
  };

  module.exports = API;

}).call(this);
