(function() {
  var BrowserWindow, Promise, _, contextMenu, cwd, cyDesktop, debug, extension, firstOrNull, getByType, getCookieUrl, getUrl, recentlyCreatedWindow, savedState, setWindowProxy, uri, user, windows;

  _ = require("lodash");

  uri = require("url");

  Promise = require("bluebird");

  cyDesktop = require("../../../desktop-gui");

  extension = require("../../../extension");

  contextMenu = require("electron-context-menu");

  BrowserWindow = require("electron").BrowserWindow;

  debug = require("debug")("cypress:server:windows");

  cwd = require("../cwd");

  user = require("../user");

  savedState = require("../saved_state");

  windows = {};

  recentlyCreatedWindow = false;

  getUrl = function(type) {
    switch (type) {
      case "INDEX":
        return cyDesktop.getPathToIndex();
      default:
        throw new Error("No acceptable window type found for: '" + type + "'");
    }
  };

  getByType = function(type) {
    return windows[type];
  };

  getCookieUrl = function(props) {
    return extension.getCookieUrl(props);
  };

  firstOrNull = function(cookies) {
    var ref;
    return (ref = cookies[0]) != null ? ref : null;
  };

  setWindowProxy = function(win) {
    if (!process.env.HTTP_PROXY) {
      return;
    }
    return win.webContents.session.setProxy({
      proxyRules: process.env.HTTP_PROXY,
      proxyBypassRules: process.env.NO_PROXY
    });
  };

  module.exports = {
    installExtension: function(path) {
      var name;
      name = BrowserWindow.addExtension(path);
      debug('electron extension installed %o', {
        success: !!name,
        name: name,
        path: path
      });
      if (!name) {
        throw new Error('Extension could not be installed.');
      }
    },
    removeAllExtensions: function() {
      var extensions;
      extensions = _.keys(BrowserWindow.getExtensions());
      debug('removing all electron extensions %o', extensions);
      return extensions.forEach(BrowserWindow.removeExtension);
    },
    reset: function() {
      return windows = {};
    },
    destroy: function(type) {
      var win;
      if (type && (win = getByType(type))) {
        return win.destroy();
      }
    },
    get: function(type) {
      var ref;
      return (function() {
        if ((ref = getByType(type)) != null) {
          return ref;
        } else {
          throw new Error("No window exists for: '" + type + "'");
        }
      })();
    },
    showAll: function() {
      return _.invoke(windows, "showInactive");
    },
    hideAllUnlessAnotherWindowIsFocused: function() {
      if (BrowserWindow.getFocusedWindow() || recentlyCreatedWindow) {
        return;
      }
      return _.invoke(windows, "hide");
    },
    focusMainWindow: function() {
      return getByType('INDEX').show();
    },
    getByWebContents: function(webContents) {
      return BrowserWindow.fromWebContents(webContents);
    },
    _newBrowserWindow: function(options) {
      return new BrowserWindow(options);
    },
    defaults: function(options) {
      if (options == null) {
        options = {};
      }
      return _.defaultsDeep(options, {
        x: null,
        y: null,
        show: true,
        frame: true,
        width: null,
        height: null,
        minWidth: null,
        minHeight: null,
        devTools: false,
        trackState: false,
        contextMenu: false,
        recordFrameRate: null,
        onFocus: function() {},
        onBlur: function() {},
        onClose: function() {},
        onCrashed: function() {},
        onNewWindow: function() {},
        webPreferences: {
          partition: null,
          webSecurity: true,
          nodeIntegration: false,
          backgroundThrottling: false
        }
      });
    },
    create: function(projectRoot, options) {
      var ts, win;
      if (options == null) {
        options = {};
      }
      options = this.defaults(options);
      if (options.show === false) {
        options.frame = false;
        options.webPreferences.offscreen = true;
      }
      options.webPreferences.webSecurity = !!options.chromeWebSecurity;
      if (options.partition) {
        options.webPreferences.partition = options.partition;
      }
      win = this._newBrowserWindow(options);
      win.on("blur", function() {
        return options.onBlur.apply(win, arguments);
      });
      win.on("focus", function() {
        return options.onFocus.apply(win, arguments);
      });
      win.once("closed", function() {
        win.removeAllListeners();
        return options.onClose.apply(win, arguments);
      });
      if (options.show === false) {
        win.webContents.on("did-start-loading", function() {
          if (!win.isDestroyed()) {
            return win.focusOnWebView();
          }
        });
      }
      win.webContents.on("crashed", function() {
        return options.onCrashed.apply(win, arguments);
      });
      win.webContents.on("new-window", function() {
        return options.onNewWindow.apply(win, arguments);
      });
      if (ts = options.trackState) {
        this.trackState(projectRoot, options.isTextTerminal, win, ts);
      }
      if (options.devTools) {
        win.webContents.openDevTools();
      }
      if (options.contextMenu) {
        contextMenu({
          showInspectElement: true,
          window: win
        });
      }
      return win;
    },
    open: function(projectRoot, options) {
      var win;
      if (options == null) {
        options = {};
      }
      if (win = getByType(options.type)) {
        win.show();
        return Promise.resolve(win);
      }
      recentlyCreatedWindow = true;
      _.defaults(options, {
        width: 600,
        height: 500,
        show: true,
        webPreferences: {
          preload: cwd("lib", "ipc", "ipc.js")
        }
      });
      if (!options.url) {
        options.url = getUrl(options.type);
      }
      win = this.create(projectRoot, options);
      debug("creating electron window with options %o", options);
      windows[options.type] = win;
      win.webContents.id = _.uniqueId("webContents");
      win.once("closed", function() {
        return delete windows[options.type];
      });
      return Promise.join(options.url, setWindowProxy(win)).spread(function(url) {
        win.loadURL(url);
        return recentlyCreatedWindow = false;
      }).thenReturn(win);
    },
    trackState: function(projectRoot, isTextTerminal, win, keys) {
      var isDestroyed;
      isDestroyed = function() {
        return win.isDestroyed();
      };
      win.on("resize", _.debounce(function() {
        var height, newState, ref, ref1, width, x, y;
        if (isDestroyed()) {
          return;
        }
        ref = win.getSize(), width = ref[0], height = ref[1];
        ref1 = win.getPosition(), x = ref1[0], y = ref1[1];
        newState = {};
        newState[keys.width] = width;
        newState[keys.height] = height;
        newState[keys.x] = x;
        newState[keys.y] = y;
        return savedState.create(projectRoot, isTextTerminal).then(function(state) {
          return state.set(newState);
        });
      }, 500));
      win.on("moved", _.debounce(function() {
        var newState, ref, x, y;
        if (isDestroyed()) {
          return;
        }
        ref = win.getPosition(), x = ref[0], y = ref[1];
        newState = {};
        newState[keys.x] = x;
        newState[keys.y] = y;
        return savedState.create(projectRoot, isTextTerminal).then(function(state) {
          return state.set(newState);
        });
      }, 500));
      win.webContents.on("devtools-opened", function() {
        var newState;
        newState = {};
        newState[keys.devTools] = true;
        return savedState.create(projectRoot, isTextTerminal).then(function(state) {
          return state.set(newState);
        });
      });
      return win.webContents.on("devtools-closed", function() {
        var newState;
        newState = {};
        newState[keys.devTools] = false;
        return savedState.create(projectRoot, isTextTerminal).then(function(state) {
          return state.set(newState);
        });
      });
    }
  };

}).call(this);
