(function() {
  var DELAYS, Promise, SIXTY_SECONDS, THIRTY_SECONDS, TWO_MINUTES, _, agent, cache, cacheResponse, debug, errors, formatResponseBody, getCachedResponse, humanInterval, intervals, isRetriableError, machineId, os, pkg, request, responseCache, routes, rp, system, tagError;

  _ = require("lodash");

  os = require("os");

  debug = require("debug")("cypress:server:api");

  request = require("@cypress/request-promise");

  errors = require("@cypress/request-promise/errors");

  Promise = require("bluebird");

  humanInterval = require("human-interval");

  agent = require("../../network").agent;

  pkg = require("../../root");

  machineId = require("./util/machine_id");

  routes = require("./util/routes");

  system = require("./util/system");

  cache = require("./cache");

  THIRTY_SECONDS = humanInterval("30 seconds");

  SIXTY_SECONDS = humanInterval("60 seconds");

  TWO_MINUTES = humanInterval("2 minutes");

  DELAYS = [THIRTY_SECONDS, SIXTY_SECONDS, TWO_MINUTES];

  responseCache = {};

  if (intervals = process.env.API_RETRY_INTERVALS) {
    DELAYS = _.chain(intervals).split(",").map(_.toNumber).value();
  }

  rp = request.defaults(function(params, callback) {
    var headers, method, resp;
    if (params == null) {
      params = {};
    }
    if (params.cacheable && (resp = getCachedResponse(params))) {
      debug("resolving with cached response for ", params.url);
      return Promise.resolve(resp);
    }
    _.defaults(params, {
      agent: agent,
      proxy: null,
      gzip: true,
      cacheable: false
    });
    headers = params.headers != null ? params.headers : params.headers = {};
    _.defaults(headers, {
      "x-os-name": os.platform(),
      "x-cypress-version": pkg.version
    });
    method = params.method.toLowerCase();
    debug("request to url: %s with params: %j and token: %s", params.method + " " + params.url, _.pick(params, "body", "headers"), params.auth && params.auth.bearer);
    return request[method](params, callback).promise().tap(function(resp) {
      if (params.cacheable) {
        debug("caching response for ", params.url);
        cacheResponse(resp, params);
      }
      return debug("response %o", resp);
    });
  });

  cacheResponse = function(resp, params) {
    return responseCache[params.url] = resp;
  };

  getCachedResponse = function(params) {
    return responseCache[params.url];
  };

  formatResponseBody = function(err) {
    var body;
    if (_.isObject(err.error)) {
      body = JSON.stringify(err.error, null, 2);
      err.message = [err.statusCode, body].join("\n\n");
    }
    throw err;
  };

  tagError = function(err) {
    err.isApiError = true;
    throw err;
  };

  isRetriableError = function(err) {
    var ref;
    return (err instanceof Promise.TimeoutError) || ((500 <= (ref = err.statusCode) && ref < 600)) || (err.statusCode == null);
  };

  module.exports = {
    rp: rp,
    ping: function() {
      return rp.get(routes.ping())["catch"](tagError);
    },
    getMe: function(authToken) {
      return rp.get({
        url: routes.me(),
        json: true,
        auth: {
          bearer: authToken
        }
      });
    },
    getAuthUrls: function() {
      return rp.get({
        url: routes.auth(),
        json: true,
        cacheable: true,
        headers: {
          "x-route-version": "2"
        }
      })["catch"](tagError);
    },
    getOrgs: function(authToken) {
      return rp.get({
        url: routes.orgs(),
        json: true,
        auth: {
          bearer: authToken
        }
      })["catch"](tagError);
    },
    getProjects: function(authToken) {
      return rp.get({
        url: routes.projects(),
        json: true,
        auth: {
          bearer: authToken
        }
      })["catch"](tagError);
    },
    getProject: function(projectId, authToken) {
      return rp.get({
        url: routes.project(projectId),
        json: true,
        auth: {
          bearer: authToken
        },
        headers: {
          "x-route-version": "2"
        }
      })["catch"](tagError);
    },
    getProjectRuns: function(projectId, authToken, options) {
      var ref;
      if (options == null) {
        options = {};
      }
      if (options.page == null) {
        options.page = 1;
      }
      return rp.get({
        url: routes.projectRuns(projectId),
        json: true,
        timeout: (ref = options.timeout) != null ? ref : 10000,
        auth: {
          bearer: authToken
        },
        headers: {
          "x-route-version": "3"
        }
      })["catch"](errors.StatusCodeError, formatResponseBody)["catch"](tagError);
    },
    createRun: function(options) {
      var body, ref;
      if (options == null) {
        options = {};
      }
      body = _.pick(options, ["ci", "specs", "commit", "group", "platform", "parallel", "ciBuildId", "projectId", "recordKey", "specPattern", "tags"]);
      return rp.post({
        body: body,
        url: routes.runs(),
        json: true,
        timeout: (ref = options.timeout) != null ? ref : SIXTY_SECONDS,
        headers: {
          "x-route-version": "4"
        }
      })["catch"](errors.StatusCodeError, formatResponseBody)["catch"](tagError);
    },
    createInstance: function(options) {
      var body, runId, timeout;
      if (options == null) {
        options = {};
      }
      runId = options.runId, timeout = options.timeout;
      body = _.pick(options, ["spec", "groupId", "machineId", "platform"]);
      return rp.post({
        body: body,
        url: routes.instances(runId),
        json: true,
        timeout: timeout != null ? timeout : SIXTY_SECONDS,
        headers: {
          "x-route-version": "5"
        }
      })["catch"](errors.StatusCodeError, formatResponseBody)["catch"](tagError);
    },
    updateInstanceStdout: function(options) {
      var ref;
      if (options == null) {
        options = {};
      }
      return rp.put({
        url: routes.instanceStdout(options.instanceId),
        json: true,
        timeout: (ref = options.timeout) != null ? ref : SIXTY_SECONDS,
        body: {
          stdout: options.stdout
        }
      })["catch"](errors.StatusCodeError, formatResponseBody)["catch"](tagError);
    },
    updateInstance: function(options) {
      var ref;
      if (options == null) {
        options = {};
      }
      return rp.put({
        url: routes.instance(options.instanceId),
        json: true,
        timeout: (ref = options.timeout) != null ? ref : SIXTY_SECONDS,
        headers: {
          "x-route-version": "2"
        },
        body: _.pick(options, ["stats", "tests", "error", "video", "hooks", "stdout", "screenshots", "cypressConfig", "reporterStats"])
      })["catch"](errors.StatusCodeError, formatResponseBody)["catch"](tagError);
    },
    createCrashReport: function(body, authToken, timeout) {
      if (timeout == null) {
        timeout = 3000;
      }
      return rp.post({
        url: routes.exceptions(),
        json: true,
        body: body,
        auth: {
          bearer: authToken
        }
      }).timeout(timeout)["catch"](tagError);
    },
    postLogout: function(authToken) {
      return Promise.join(this.getAuthUrls(), machineId.machineId(), function(urls, machineId) {
        return rp.post({
          url: urls.dashboardLogoutUrl,
          json: true,
          auth: {
            bearer: authToken
          },
          headers: {
            "x-machine-id": machineId
          }
        })["catch"]({
          statusCode: 401
        }, function() {})["catch"](tagError);
      });
    },
    createProject: function(projectDetails, remoteOrigin, authToken) {
      debug("create project with args %o", {
        projectDetails: projectDetails,
        remoteOrigin: remoteOrigin,
        authToken: authToken
      });
      return rp.post({
        url: routes.projects(),
        json: true,
        auth: {
          bearer: authToken
        },
        headers: {
          "x-route-version": "2"
        },
        body: {
          name: projectDetails.projectName,
          orgId: projectDetails.orgId,
          "public": projectDetails["public"],
          remoteOrigin: remoteOrigin
        }
      })["catch"](errors.StatusCodeError, formatResponseBody)["catch"](tagError);
    },
    getProjectRecordKeys: function(projectId, authToken) {
      return rp.get({
        url: routes.projectRecordKeys(projectId),
        json: true,
        auth: {
          bearer: authToken
        }
      })["catch"](tagError);
    },
    requestAccess: function(projectId, authToken) {
      return rp.post({
        url: routes.membershipRequests(projectId),
        json: true,
        auth: {
          bearer: authToken
        }
      })["catch"](errors.StatusCodeError, formatResponseBody)["catch"](tagError);
    },
    _projectToken: function(method, projectId, authToken) {
      return rp({
        method: method,
        url: routes.projectToken(projectId),
        json: true,
        auth: {
          bearer: authToken
        },
        headers: {
          "x-route-version": "2"
        }
      }).get("apiToken")["catch"](tagError);
    },
    getProjectToken: function(projectId, authToken) {
      return this._projectToken("get", projectId, authToken);
    },
    updateProjectToken: function(projectId, authToken) {
      return this._projectToken("put", projectId, authToken);
    },
    retryWithBackoff: function(fn, options) {
      var attempt;
      if (options == null) {
        options = {};
      }
      if (process.env.DISABLE_API_RETRIES) {
        debug("api retries disabled");
        return Promise["try"](fn);
      }
      return (attempt = function(retryIndex) {
        return Promise["try"](fn)["catch"](isRetriableError, function(err) {
          var delay;
          if (retryIndex > DELAYS.length) {
            throw err;
          }
          delay = DELAYS[retryIndex];
          if (options.onBeforeRetry) {
            options.onBeforeRetry({
              err: err,
              delay: delay,
              retryIndex: retryIndex,
              total: DELAYS.length
            });
          }
          retryIndex++;
          return Promise.delay(delay).then(function() {
            debug("retry #" + retryIndex + " after " + delay + "ms");
            return attempt(retryIndex);
          });
        });
      })(0);
    },
    clearCache: function() {
      return responseCache = {};
    }
  };

}).call(this);
