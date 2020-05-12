(function() {
  var Project, Updater, Windows, _, api, auth, browsers, chromePolicyCheck, clipboard, debug, dialog, editors, ensureUrl, errors, handleEvent, ipc, konfig, logs, nullifyUnserializableValues, open, openProject, pkg, pluralize, ref, shell, stripAnsi, user;

  _ = require("lodash");

  ipc = require("electron").ipcMain;

  ref = require('electron'), shell = ref.shell, clipboard = ref.clipboard;

  debug = require('debug')('cypress:server:events');

  pluralize = require("pluralize");

  stripAnsi = require("strip-ansi");

  dialog = require("./dialog");

  pkg = require("./package");

  logs = require("./logs");

  auth = require("./auth");

  Windows = require("./windows");

  api = require("../api");

  open = require("../util/open");

  user = require("../user");

  errors = require("../errors");

  Updater = require("../updater");

  Project = require("../project");

  openProject = require("../open_project");

  ensureUrl = require("../util/ensure-url");

  chromePolicyCheck = require("../util/chrome_policy_check");

  browsers = require("../browsers");

  konfig = require("../konfig");

  editors = require("../util/editors");

  nullifyUnserializableValues = (function(_this) {
    return function(obj) {
      return _.cloneDeepWith(obj, function(val) {
        if (_.isFunction(val)) {
          return null;
        }
      });
    };
  })(this);

  handleEvent = function(options, bus, event, id, type, arg) {
    var apiUrl, baseUrl, fullSpec, onBus, onError, onFocusTests, onMessage, onSettingsChanged, onSpecChanged, onWarning, send, sendErr, sendNull, sendResponse;
    debug("got request for event: %s, %o", type, arg);
    sendResponse = function(originalData) {
      var data;
      if (originalData == null) {
        originalData = {};
      }
      try {
        data = nullifyUnserializableValues(originalData);
        debug("sending ipc data %o", {
          type: type,
          data: data,
          originalData: originalData
        });
        return event.sender.send("response", data);
      } catch (error) {}
    };
    sendErr = function(err) {
      debug("send error: %o", err);
      return sendResponse({
        id: id,
        __error: errors.clone(err, {
          html: true
        })
      });
    };
    send = function(data) {
      return sendResponse({
        id: id,
        data: data
      });
    };
    sendNull = function() {
      return send(null);
    };
    onBus = function(event) {
      bus.removeAllListeners(event);
      return bus.on(event, send);
    };
    switch (type) {
      case "on:menu:clicked":
        return onBus("menu:item:clicked");
      case "on:app:event":
        return onBus("app:events");
      case "on:focus:tests":
        return onBus("focus:tests");
      case "on:spec:changed":
        return onBus("spec:changed");
      case "on:config:changed":
        return onBus("config:changed");
      case "on:project:error":
        return onBus("project:error");
      case "on:auth:message":
        return onBus("auth:message");
      case "on:project:warning":
        return onBus("project:warning");
      case "gui:error":
        return logs.error(arg).then(sendNull)["catch"](sendErr);
      case "show:directory:dialog":
        return dialog.show().then(send)["catch"](sendErr);
      case "log:in":
        return user.logIn(arg).then(send)["catch"](sendErr);
      case "log:out":
        return user.logOut().then(send)["catch"](sendErr);
      case "get:current:user":
        return user.getSafely().then(send)["catch"](sendErr);
      case "external:open":
        return shell.openExternal(arg);
      case "close:browser":
        return openProject.closeBrowser().then(send)["catch"](sendErr);
      case "launch:browser":
        debug("launching browser for '%s' spec: %o", arg.specType, arg.spec);
        fullSpec = _.merge({}, arg.spec, {
          specType: arg.specType
        });
        return openProject.launch(arg.browser, fullSpec, {
          projectRoot: options.projectRoot,
          onBrowserOpen: function() {
            return send({
              browserOpened: true
            });
          },
          onBrowserClose: function() {
            return send({
              browserClosed: true
            });
          }
        })["catch"]((function(_this) {
          return function(err) {
            if (err.title == null) {
              err.title = 'Error launching browser';
            }
            return sendErr(err);
          };
        })(this));
      case "begin:auth":
        onMessage = function(msg) {
          return bus.emit('auth:message', msg);
        };
        return auth.start(onMessage).then(send)["catch"](sendErr);
      case "window:open":
        return Windows.open(options.projectRoot, arg).then(send)["catch"](sendErr);
      case "window:close":
        return Windows.getByWebContents(event.sender).destroy();
      case "open:finder":
        return open.opn(arg).then(send)["catch"](sendErr);
      case "get:options":
        return pkg(options).then(send)["catch"](sendErr);
      case "updater:check":
        return Updater.check({
          onNewVersion: function(arg1) {
            var version;
            version = arg1.version;
            return send(version);
          },
          onNoNewVersion: function() {
            return send(false);
          }
        });
      case "get:logs":
        return logs.get().then(send)["catch"](sendErr);
      case "clear:logs":
        return logs.clear().then(sendNull)["catch"](sendErr);
      case "on:log":
        return logs.onLog(send);
      case "off:log":
        logs.off();
        return send(null);
      case "get:orgs":
        return Project.getOrgs().then(send)["catch"](sendErr);
      case "get:projects":
        return Project.getPathsAndIds().then(send)["catch"](sendErr);
      case "get:project:statuses":
        return Project.getProjectStatuses(arg).then(send)["catch"](sendErr);
      case "get:project:status":
        return Project.getProjectStatus(arg).then(send)["catch"](sendErr);
      case "add:project":
        return Project.add(arg, options).then(send)["catch"](sendErr);
      case "remove:project":
        return Project.remove(arg).then(function() {
          return send(arg);
        })["catch"](sendErr);
      case "open:project":
        debug("open:project");
        onSettingsChanged = function() {
          return bus.emit("config:changed");
        };
        onSpecChanged = function(spec) {
          return bus.emit("spec:changed", spec);
        };
        onFocusTests = function() {
          if (_.isFunction(options.onFocusTests)) {
            options.onFocusTests();
          }
          return bus.emit("focus:tests");
        };
        onError = function(err) {
          return bus.emit("project:error", errors.clone(err, {
            html: true
          }));
        };
        onWarning = function(warning) {
          warning.message = stripAnsi(warning.message);
          return bus.emit("project:warning", errors.clone(warning, {
            html: true
          }));
        };
        return browsers.getAllBrowsersWith(options.browser).then(function(browsers) {
          if (browsers == null) {
            browsers = [];
          }
          debug("setting found %s on the config", pluralize("browser", browsers.length, true));
          return options.config = _.assign(options.config, {
            browsers: browsers
          });
        }).then(function() {
          chromePolicyCheck.run(function(err) {
            return options.config.browsers.forEach(function(browser) {
              if (browser.family === 'chromium') {
                return browser.warning = errors.getMsgByType('BAD_POLICY_WARNING_TOOLTIP');
              }
            });
          });
          return openProject.create(arg, options, {
            onFocusTests: onFocusTests,
            onSpecChanged: onSpecChanged,
            onSettingsChanged: onSettingsChanged,
            onError: onError,
            onWarning: onWarning
          });
        }).call("getConfig").then(send)["catch"](sendErr);
      case "close:project":
        return openProject.close().then(send)["catch"](sendErr);
      case "setup:dashboard:project":
        return openProject.createCiProject(arg).then(send)["catch"](sendErr);
      case "get:record:keys":
        return openProject.getRecordKeys().then(send)["catch"](sendErr);
      case "get:user:editor":
        return editors.getUserEditor(true).then(send)["catch"](sendErr);
      case "set:user:editor":
        return editors.setUserEditor(arg).then(send)["catch"](sendErr);
      case "get:specs":
        return openProject.getSpecChanges({
          onChange: send,
          onError: sendErr
        });
      case "get:runs":
        return openProject.getRuns().then(send)["catch"](function(err) {
          err.type = _.get(err, "statusCode") === 401 ? "UNAUTHENTICATED" : _.get(err, "cause.code") === "ESOCKETTIMEDOUT" ? "TIMED_OUT" : _.get(err, "code") === "ENOTFOUND" ? "NO_CONNECTION" : err.type || "UNKNOWN";
          return sendErr(err);
        });
      case "request:access":
        return openProject.requestAccess(arg).then(send)["catch"](function(err) {
          var ref1, ref2;
          err.type = _.get(err, "statusCode") === 403 ? "ALREADY_MEMBER" : _.get(err, "statusCode") === 422 && /existing/.test((ref1 = err.errors) != null ? (ref2 = ref1.userId) != null ? ref2.join('') : void 0 : void 0) ? "ALREADY_REQUESTED" : err.type || "UNKNOWN";
          return sendErr(err);
        });
      case "onboarding:closed":
        return openProject.getProject().saveState({
          showedOnBoardingModal: true
        }).then(sendNull);
      case "ping:api:server":
        apiUrl = konfig("api_url");
        return ensureUrl.isListening(apiUrl).then(send)["catch"](function(err) {
          var subErr;
          if (err.length) {
            subErr = err[0];
            err.name = subErr.name || (subErr.code + " " + subErr.address + ":" + subErr.port);
            err.message = subErr.message || (subErr.code + " " + subErr.address + ":" + subErr.port);
          }
          err.apiUrl = apiUrl;
          return sendErr(err);
        });
      case "ping:baseUrl":
        baseUrl = arg;
        return ensureUrl.isListening(baseUrl).then(send)["catch"](function(err) {
          var warning;
          warning = errors.get("CANNOT_CONNECT_BASE_URL_WARNING", baseUrl);
          return sendErr(warning);
        });
      case "set:clipboard:text":
        clipboard.writeText(arg);
        return sendNull();
      default:
        throw new Error("No ipc event registered for: '" + type + "'");
    }
  };

  module.exports = {
    nullifyUnserializableValues: nullifyUnserializableValues,
    handleEvent: handleEvent,
    stop: function() {
      return ipc.removeAllListeners();
    },
    start: function(options, bus) {
      return ipc.on("request", _.partial(this.handleEvent, options, bus));
    }
  };

}).call(this);
