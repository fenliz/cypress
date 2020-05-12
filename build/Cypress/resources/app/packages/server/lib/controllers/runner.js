(function() {
  var PATH_TO_NON_PROXIED_ERROR, _, _serveNonProxiedError, cache, debug, fs, os, path, pkg, runner, send;

  _ = require("lodash");

  cache = require("../cache");

  send = require("send");

  os = require("os");

  fs = require("../util/fs");

  path = require("path");

  debug = require("debug")("cypress:server:runner");

  pkg = require("../../../root");

  runner = require("../../../runner/lib/resolve-dist");

  PATH_TO_NON_PROXIED_ERROR = path.join(__dirname, "..", "html", "non_proxied_error.html");

  _serveNonProxiedError = function(res) {
    return fs.readFile(PATH_TO_NON_PROXIED_ERROR).then((function(_this) {
      return function(html) {
        return res.type('html').end(html);
      };
    })(this));
  };

  module.exports = {
    serve: function(req, res, options) {
      var base64Config, browser, config, getRemoteState, project, ref, runnerPath, spec;
      if (options == null) {
        options = {};
      }
      if (req.proxiedUrl.startsWith('/')) {
        debug('request was not proxied via Cypress, erroring %o', _.pick(req, 'proxiedUrl'));
        return _serveNonProxiedError(res);
      }
      config = options.config, getRemoteState = options.getRemoteState, project = options.project;
      ref = project.getCurrentSpecAndBrowser(), spec = ref.spec, browser = ref.browser;
      config = _.clone(config);
      config.remote = getRemoteState();
      config.version = pkg.version;
      config.platform = os.platform();
      config.arch = os.arch();
      config.spec = spec;
      config.browser = browser;
      debug("serving runner index.html with config %o", _.pick(config, "version", "platform", "arch", "projectName"));
      debug("env object has the following keys: %s", _.keys(config.env).join(", "));
      base64Config = Buffer.from(JSON.stringify(config)).toString('base64');
      runnerPath = process.env.CYPRESS_INTERNAL_RUNNER_PATH || runner.getPathToIndex();
      return res.render(runnerPath, {
        base64Config: base64Config,
        projectName: config.projectName
      });
    },
    handle: function(req, res) {
      var pathToFile;
      pathToFile = runner.getPathToDist(req.params[0]);
      return send(req, pathToFile).pipe(res);
    },
    handleSourceMappings: function(req, res) {
      var pathToFile;
      pathToFile = runner.getPathToSourceMappings();
      return send(req, pathToFile).pipe(res);
    }
  };

}).call(this);
