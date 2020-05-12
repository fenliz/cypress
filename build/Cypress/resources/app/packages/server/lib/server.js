(function() {
  var ALLOWED_PROXY_BYPASS_URLS, DEFAULT_DOMAIN_NAME, NetworkProxy, Promise, Request, Server, Socket, SocketWhitelist, _, _forceProxyMiddleware, _isNonProxiedRequest, agent, allowDestroy, appData, blacklist, check, compression, concatStream, cors, createInitialWorkers, cwd, debug, ensureUrl, errors, evilDns, express, fileServer, fullyQualifiedRe, headersUtil, http, httpProxy, httpsProxy, isHtml, isResponseHtml, la, logger, notSSE, origin, ref, setProxiedUrl, statusCode, stream, templateEngine, uri, url;

  _ = require("lodash");

  url = require("url");

  http = require("http");

  stream = require("stream");

  express = require("express");

  Promise = require("bluebird");

  evilDns = require("evil-dns");

  isHtml = require("is-html");

  httpProxy = require("http-proxy");

  la = require("lazy-ass");

  check = require("check-more-types");

  httpsProxy = require("../../https-proxy");

  compression = require("compression");

  debug = require("debug")("cypress:server:server");

  ref = require("../../network"), agent = ref.agent, blacklist = ref.blacklist, concatStream = ref.concatStream, cors = ref.cors, uri = ref.uri;

  NetworkProxy = require("../../proxy").NetworkProxy;

  createInitialWorkers = require("../../rewriter").createInitialWorkers;

  origin = require("./util/origin");

  ensureUrl = require("./util/ensure-url");

  appData = require("./util/app_data");

  statusCode = require("./util/status_code");

  headersUtil = require("./util/headers");

  allowDestroy = require("./util/server_destroy");

  SocketWhitelist = require("./util/socket_whitelist").SocketWhitelist;

  cwd = require("./cwd");

  errors = require("./errors");

  logger = require("./logger");

  Socket = require("./socket");

  Request = require("./request");

  fileServer = require("./file_server");

  templateEngine = require("./template_engine");

  DEFAULT_DOMAIN_NAME = "localhost";

  fullyQualifiedRe = /^https?:\/\//;

  ALLOWED_PROXY_BYPASS_URLS = ['/', '/__cypress/runner/cypress_runner.css', '/__cypress/static/favicon.ico'];

  _isNonProxiedRequest = function(req) {
    return req.proxiedUrl.startsWith('/');
  };

  _forceProxyMiddleware = function(clientRoute) {
    var trimmedClientRoute;
    trimmedClientRoute = _.trimEnd(clientRoute, '/');
    return function(req, res, next) {
      var trimmedUrl;
      trimmedUrl = _.trimEnd(req.proxiedUrl, '/');
      if (_isNonProxiedRequest(req) && !ALLOWED_PROXY_BYPASS_URLS.includes(trimmedUrl) && trimmedUrl !== trimmedClientRoute) {
        return res.redirect(clientRoute);
      }
      return next();
    };
  };

  isResponseHtml = function(contentType, responseBuffer) {
    var body;
    if (contentType) {
      return contentType === "text/html";
    }
    if (body = _.invoke(responseBuffer, 'toString')) {
      return isHtml(body);
    }
    return false;
  };

  setProxiedUrl = function(req) {
    if (req.proxiedUrl) {
      return;
    }
    req.proxiedUrl = uri.removeDefaultPort(req.url).format();
    return req.url = uri.getPath(req.url);
  };

  notSSE = function(req, res) {
    return req.headers.accept !== "text/event-stream" && compression.filter(req, res);
  };

  Server = (function() {
    function Server() {
      if (!(this instanceof Server)) {
        return new Server();
      }
      this._socketWhitelist = new SocketWhitelist();
      this._request = null;
      this._middleware = null;
      this._server = null;
      this._socket = null;
      this._baseUrl = null;
      this._nodeProxy = null;
      this._fileServer = null;
      this._httpsProxy = null;
      this._urlResolver = null;
    }

    Server.prototype.createExpressApp = function(config) {
      var app, clientRoute, morgan;
      morgan = config.morgan, clientRoute = config.clientRoute;
      app = express();
      app.set("view engine", "html");
      app.engine("html", templateEngine.render);
      app.use((function(_this) {
        return function(req, res, next) {
          var m;
          setProxiedUrl(req);
          if (m = _this._middleware) {
            m(req, res);
          }
          return next();
        };
      })(this));
      app.use(_forceProxyMiddleware(clientRoute));
      app.use(require("cookie-parser")());
      app.use(compression({
        filter: notSSE
      }));
      if (morgan) {
        app.use(require("morgan")("dev"));
      }
      app.use(require("errorhandler")());
      app.disable("x-powered-by");
      return app;
    };

    Server.prototype.createRoutes = function() {
      return require("./routes").apply(null, arguments);
    };

    Server.prototype.getHttpServer = function() {
      return this._server;
    };

    Server.prototype.portInUseErr = function(port) {
      var e;
      e = errors.get("PORT_IN_USE_SHORT", port);
      e.port = port;
      e.portInUse = true;
      return e;
    };

    Server.prototype.open = function(config, project, onError, onWarning) {
      if (config == null) {
        config = {};
      }
      debug("server open");
      la(_.isPlainObject(config), "expected plain config object", config);
      return Promise["try"]((function(_this) {
        return function() {
          var app, getFileServerToken, getRemoteState;
          app = _this.createExpressApp(config);
          logger.setSettings(config);
          _this._request = Request({
            timeout: config.responseTimeout
          });
          _this._nodeProxy = httpProxy.createProxyServer();
          getRemoteState = function() {
            return _this._getRemoteState();
          };
          getFileServerToken = function() {
            return _this._fileServer.token;
          };
          _this._networkProxy = new NetworkProxy({
            config: config,
            getRemoteState: getRemoteState,
            getFileServerToken: getFileServerToken,
            request: _this._request
          });
          if (config.experimentalSourceRewriting) {
            createInitialWorkers();
          }
          _this.createHosts(config.hosts);
          _this.createRoutes({
            app: app,
            config: config,
            getRemoteState: getRemoteState,
            networkProxy: _this._networkProxy,
            onError: onError,
            project: project
          });
          return _this.createServer(app, config, project, _this._request, onWarning);
        };
      })(this));
    };

    Server.prototype.createHosts = function(hosts) {
      if (hosts == null) {
        hosts = {};
      }
      return _.each(hosts, function(ip, host) {
        return evilDns.add(host, ip);
      });
    };

    Server.prototype.createServer = function(app, config, project, request, onWarning) {
      return new Promise((function(_this) {
        return function(resolve, reject) {
          var baseUrl, blacklistHosts, callListeners, fileServerFolder, onError, onSniUpgrade, onUpgrade, port, socketIoRoute;
          port = config.port, fileServerFolder = config.fileServerFolder, socketIoRoute = config.socketIoRoute, baseUrl = config.baseUrl, blacklistHosts = config.blacklistHosts;
          _this._server = http.createServer(app);
          allowDestroy(_this._server);
          onError = function(err) {
            if (err.code === "EADDRINUSE") {
              return reject(_this.portInUseErr(port));
            }
          };
          onUpgrade = function(req, socket, head) {
            debug("Got UPGRADE request from %s", req.url);
            return _this.proxyWebsockets(_this._nodeProxy, socketIoRoute, req, socket, head);
          };
          callListeners = function(req, res) {
            var listeners;
            listeners = _this._server.listeners("request").slice(0);
            return _this._callRequestListeners(_this._server, listeners, req, res);
          };
          onSniUpgrade = function(req, socket, head) {
            var i, len, results, upgrade, upgrades;
            upgrades = _this._server.listeners("upgrade").slice(0);
            results = [];
            for (i = 0, len = upgrades.length; i < len; i++) {
              upgrade = upgrades[i];
              results.push(upgrade.call(_this._server, req, socket, head));
            }
            return results;
          };
          _this._server.on("connect", function(req, socket, head) {
            debug("Got CONNECT request from %s", req.url);
            socket.once('upstream-connected', _this._socketWhitelist.add);
            return _this._httpsProxy.connect(req, socket, head, {
              onDirectConnection: function(req) {
                var isMatching, urlToCheck, word;
                urlToCheck = "https://" + req.url;
                isMatching = cors.urlMatchesOriginPolicyProps(urlToCheck, _this._remoteProps);
                word = isMatching ? "does" : "does not";
                debug("HTTPS request " + word + " match URL: " + urlToCheck + " with props: %o", _this._remoteProps);
                if (blacklistHosts && !isMatching) {
                  isMatching = blacklist.matches(urlToCheck, blacklistHosts);
                  debug("HTTPS request " + urlToCheck + " matches blacklist?", isMatching);
                }
                return !isMatching;
              }
            });
          });
          _this._server.on("upgrade", onUpgrade);
          _this._server.once("error", onError);
          return _this._listen(port, onError).then(function(port) {
            return Promise.all([
              httpsProxy.create(appData.path("proxy"), port, {
                onRequest: callListeners,
                onUpgrade: onSniUpgrade
              }), fileServer.create(fileServerFolder)
            ]).spread(function(httpsProxy, fileServer) {
              _this._httpsProxy = httpsProxy;
              _this._fileServer = fileServer;
              if (baseUrl) {
                _this._baseUrl = baseUrl;
                if (config.isTextTerminal) {
                  return _this._retryBaseUrlCheck(baseUrl, onWarning)["return"](null)["catch"](function(e) {
                    debug(e);
                    return reject(errors.get("CANNOT_CONNECT_BASE_URL", baseUrl));
                  });
                }
                return ensureUrl.isListening(baseUrl)["return"](null)["catch"](function(err) {
                  return errors.get("CANNOT_CONNECT_BASE_URL_WARNING", baseUrl);
                });
              }
            }).then(function(warning) {
              _this._onDomainSet(baseUrl != null ? baseUrl : "<root>");
              return resolve([port, warning]);
            });
          });
        };
      })(this));
    };

    Server.prototype._port = function() {
      return _.chain(this._server).invoke("address").get("port").value();
    };

    Server.prototype._listen = function(port, onError) {
      return new Promise((function(_this) {
        return function(resolve) {
          var listener;
          listener = function() {
            var address;
            address = _this._server.address();
            _this.isListening = true;
            debug("Server listening on ", address);
            _this._server.removeListener("error", onError);
            return resolve(address.port);
          };
          return _this._server.listen(port || 0, '127.0.0.1', listener);
        };
      })(this));
    };

    Server.prototype._getRemoteState = function() {
      var props;
      props = _.extend({}, {
        auth: this._remoteAuth,
        props: this._remoteProps,
        origin: this._remoteOrigin,
        strategy: this._remoteStrategy,
        visiting: this._remoteVisitingUrl,
        domainName: this._remoteDomainName,
        fileServer: this._remoteFileServer
      });
      debug("Getting remote state: %o", props);
      return props;
    };

    Server.prototype._onRequest = function(headers, automationRequest, options) {
      return this._request.sendPromise(headers, automationRequest, options);
    };

    Server.prototype._onResolveUrl = function(urlStr, headers, automationRequest, options) {
      var currentPromisePhase, handlingLocalFile, originalUrl, p, previousState, reqStream, request, runPhase, startTime;
      if (options == null) {
        options = {
          headers: {}
        };
      }
      debug("resolving visit %o", {
        url: urlStr,
        headers: headers,
        options: options
      });
      this._networkProxy.reset();
      startTime = new Date();
      if (this._urlResolver) {
        this._urlResolver.cancel();
      }
      request = this._request;
      handlingLocalFile = false;
      previousState = _.clone(this._getRemoteState());
      urlStr = url.parse(urlStr);
      urlStr.hash = null;
      urlStr = urlStr.format();
      originalUrl = urlStr;
      reqStream = null;
      currentPromisePhase = null;
      runPhase = function(fn) {
        return currentPromisePhase = fn();
      };
      return this._urlResolver = p = new Promise((function(_this) {
        return function(resolve, reject, onCancel) {
          var newUrl, onReqError, onReqStreamReady, redirects, restorePreviousState, urlFile;
          onCancel(function() {
            p.currentPromisePhase = currentPromisePhase;
            p.reqStream = reqStream;
            _.invoke(reqStream, "abort");
            return _.invoke(currentPromisePhase, "cancel");
          });
          redirects = [];
          newUrl = null;
          if (!fullyQualifiedRe.test(urlStr)) {
            handlingLocalFile = true;
            options.headers['x-cypress-authorization'] = _this._fileServer.token;
            _this._remoteVisitingUrl = true;
            _this._onDomainSet(urlStr, options);
            urlFile = url.resolve(_this._remoteFileServer, urlStr);
            urlStr = url.resolve(_this._remoteOrigin, urlStr);
          }
          onReqError = function(err) {
            if (p.isPending()) {
              restorePreviousState();
            }
            return reject(err);
          };
          onReqStreamReady = function(str) {
            reqStream = str;
            return str.on("error", onReqError).on("response", function(incomingRes) {
              debug("resolve:url headers received, buffering response %o", _.pick(incomingRes, "headers", "statusCode"));
              if (newUrl == null) {
                newUrl = urlStr;
              }
              return runPhase(function() {
                return automationRequest("get:cookies", {
                  domain: cors.getSuperDomain(newUrl)
                }).then(function(cookies) {
                  var concatStr, contentType, details, fp, isOk, statusIs2xxOrAllowedFailure;
                  _this._remoteVisitingUrl = false;
                  statusIs2xxOrAllowedFailure = function() {
                    return statusCode.isOk(incomingRes.statusCode) || (options.failOnStatusCode === false);
                  };
                  isOk = statusIs2xxOrAllowedFailure();
                  contentType = headersUtil.getContentType(incomingRes);
                  details = {
                    isOkStatusCode: isOk,
                    contentType: contentType,
                    url: newUrl,
                    status: incomingRes.statusCode,
                    cookies: cookies,
                    statusText: statusCode.getText(incomingRes.statusCode),
                    redirects: redirects,
                    originalUrl: originalUrl
                  };
                  if (fp = incomingRes.headers["x-cypress-file-path"]) {
                    details.filePath = fp;
                  }
                  debug("setting details resolving url %o", details);
                  concatStr = concatStream(function(responseBuffer) {
                    var responseBufferStream;
                    details.isHtml = isResponseHtml(contentType, responseBuffer);
                    debug("resolve:url response ended, setting buffer %o", {
                      newUrl: newUrl,
                      details: details
                    });
                    details.totalTime = new Date() - startTime;
                    if (isOk && details.isHtml) {
                      if (!handlingLocalFile) {
                        _this._onDomainSet(newUrl, options);
                      }
                      responseBufferStream = new stream.PassThrough({
                        highWaterMark: Number.MAX_SAFE_INTEGER
                      });
                      responseBufferStream.end(responseBuffer);
                      _this._networkProxy.setHttpBuffer({
                        url: newUrl,
                        stream: responseBufferStream,
                        details: details,
                        originalUrl: originalUrl,
                        response: incomingRes
                      });
                    } else {
                      restorePreviousState();
                    }
                    return resolve(details);
                  });
                  return str.pipe(concatStr);
                })["catch"](onReqError);
              });
            });
          };
          restorePreviousState = function() {
            _this._remoteAuth = previousState.auth;
            _this._remoteProps = previousState.props;
            _this._remoteOrigin = previousState.origin;
            _this._remoteStrategy = previousState.strategy;
            _this._remoteFileServer = previousState.fileServer;
            _this._remoteDomainName = previousState.domainName;
            return _this._remoteVisitingUrl = previousState.visiting;
          };
          if (options.method === 'POST' && _.isObject(options.body)) {
            options.form = options.body;
            delete options.body;
          }
          _.assign(options, {
            gzip: false,
            url: urlFile != null ? urlFile : urlStr,
            headers: _.assign({
              accept: "text/html,*/*"
            }, options.headers),
            onBeforeReqInit: runPhase,
            followRedirect: function(incomingRes) {
              var curr, next, status;
              status = incomingRes.statusCode;
              next = incomingRes.headers.location;
              curr = newUrl != null ? newUrl : urlStr;
              newUrl = url.resolve(curr, next);
              redirects.push([status, newUrl].join(": "));
              return true;
            }
          });
          debug('sending request with options %o', options);
          return runPhase(function() {
            return request.sendStream(headers, automationRequest, options).then(function(createReqStream) {
              return onReqStreamReady(createReqStream());
            })["catch"](onReqError);
          });
        };
      })(this));
    };

    Server.prototype._onDomainSet = function(fullyQualifiedUrl, options) {
      var l, ref1;
      if (options == null) {
        options = {};
      }
      l = function(type, val) {
        return debug("Setting", type, val);
      };
      this._remoteAuth = options.auth;
      l("remoteAuth", this._remoteAuth);
      if (fullyQualifiedUrl === "<root>" || !fullyQualifiedRe.test(fullyQualifiedUrl)) {
        this._remoteOrigin = "http://" + DEFAULT_DOMAIN_NAME + ":" + (this._port());
        this._remoteStrategy = "file";
        this._remoteFileServer = "http://" + DEFAULT_DOMAIN_NAME + ":" + ((ref1 = this._fileServer) != null ? ref1.port() : void 0);
        this._remoteDomainName = DEFAULT_DOMAIN_NAME;
        this._remoteProps = null;
        l("remoteOrigin", this._remoteOrigin);
        l("remoteStrategy", this._remoteStrategy);
        l("remoteHostAndPort", this._remoteProps);
        l("remoteDocDomain", this._remoteDomainName);
        l("remoteFileServer", this._remoteFileServer);
      } else {
        this._remoteOrigin = origin(fullyQualifiedUrl);
        this._remoteStrategy = "http";
        this._remoteFileServer = null;
        this._remoteProps = cors.parseUrlIntoDomainTldPort(this._remoteOrigin);
        this._remoteDomainName = _.compact([this._remoteProps.domain, this._remoteProps.tld]).join(".");
        l("remoteOrigin", this._remoteOrigin);
        l("remoteHostAndPort", this._remoteProps);
        l("remoteDocDomain", this._remoteDomainName);
      }
      return this._getRemoteState();
    };

    Server.prototype._callRequestListeners = function(server, listeners, req, res) {
      var i, len, listener, results;
      results = [];
      for (i = 0, len = listeners.length; i < len; i++) {
        listener = listeners[i];
        results.push(listener.call(server, req, res));
      }
      return results;
    };

    Server.prototype._normalizeReqUrl = function(server) {
      var listeners;
      listeners = server.listeners("request").slice(0);
      server.removeAllListeners("request");
      return server.on("request", (function(_this) {
        return function(req, res) {
          setProxiedUrl(req);
          return _this._callRequestListeners(server, listeners, req, res);
        };
      })(this));
    };

    Server.prototype._retryBaseUrlCheck = function(baseUrl, onWarning) {
      return ensureUrl.retryIsListening(baseUrl, {
        retryIntervals: [3000, 3000, 4000],
        onRetry: function(arg) {
          var attempt, delay, remaining, warning;
          attempt = arg.attempt, delay = arg.delay, remaining = arg.remaining;
          warning = errors.get("CANNOT_CONNECT_BASE_URL_RETRYING", {
            remaining: remaining,
            attempt: attempt,
            delay: delay,
            baseUrl: baseUrl
          });
          return onWarning(warning);
        }
      });
    };

    Server.prototype.proxyWebsockets = function(proxy, socketIoRoute, req, socket, head) {
      var host, hostname, onProxyErr, port, protocol, remoteOrigin;
      if (req.url.startsWith(socketIoRoute)) {
        if (!this._socketWhitelist.isRequestWhitelisted(req)) {
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\nRequest not made via a Cypress-launched browser.');
          socket.end();
        }
        return;
      }
      if ((host = req.headers.host) && this._remoteProps && (remoteOrigin = this._remoteOrigin)) {
        port = this._remoteProps.port;
        protocol = url.parse(remoteOrigin).protocol;
        hostname = url.parse("http://" + host).hostname;
        onProxyErr = function(err, req, res) {
          return debug("Got ERROR proxying websocket connection", {
            err: err,
            port: port,
            protocol: protocol,
            hostname: hostname,
            req: req
          });
        };
        return proxy.ws(req, socket, head, {
          secure: false,
          target: {
            host: hostname,
            port: port,
            protocol: protocol
          },
          agent: agent
        }, onProxyErr);
      } else {
        if (socket.writable) {
          return socket.end();
        }
      }
    };

    Server.prototype.reset = function() {
      var ref1, ref2;
      if ((ref1 = this._networkProxy) != null) {
        ref1.reset();
      }
      return this._onDomainSet((ref2 = this._baseUrl) != null ? ref2 : "<root>");
    };

    Server.prototype._close = function() {
      this.reset();
      logger.unsetSettings();
      evilDns.clear();
      if (!this._server || !this.isListening) {
        return Promise.resolve();
      }
      return this._server.destroyAsync().then((function(_this) {
        return function() {
          return _this.isListening = false;
        };
      })(this));
    };

    Server.prototype.close = function() {
      var ref1, ref2, ref3;
      return Promise.join(this._close(), (ref1 = this._socket) != null ? ref1.close() : void 0, (ref2 = this._fileServer) != null ? ref2.close() : void 0, (ref3 = this._httpsProxy) != null ? ref3.close() : void 0).then((function(_this) {
        return function() {
          return _this._middleware = null;
        };
      })(this));
    };

    Server.prototype.end = function() {
      return this._socket && this._socket.end();
    };

    Server.prototype.changeToUrl = function(url) {
      return this._socket && this._socket.changeToUrl(url);
    };

    Server.prototype.onTestFileChange = function(filePath) {
      return this._socket && this._socket.onTestFileChange(filePath);
    };

    Server.prototype.onRequest = function(fn) {
      return this._middleware = fn;
    };

    Server.prototype.onNextRequest = function(fn) {
      return this.onRequest((function(_this) {
        return function() {
          fn.apply(_this, arguments);
          return _this._middleware = null;
        };
      })(this));
    };

    Server.prototype.startWebsockets = function(automation, config, options) {
      if (options == null) {
        options = {};
      }
      options.onResolveUrl = this._onResolveUrl.bind(this);
      options.onRequest = this._onRequest.bind(this);
      options.onResetServerState = (function(_this) {
        return function() {
          return _this._networkProxy.reset();
        };
      })(this);
      this._socket = new Socket(config);
      this._socket.startListening(this._server, automation, config, options);
      return this._normalizeReqUrl(this._server);
    };

    return Server;

  })();

  module.exports = Server;

}).call(this);
