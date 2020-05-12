(function() {
  var Promise, app, base, config, cwd, debug, e, electronLaunchArguments, env, os, pkg, ref;

  require("./util/fs");

  os = require("os");

  cwd = require("./cwd");

  Promise = require("bluebird");

  debug = require("debug")("cypress:server");

  Error.stackTraceLimit = 2e308;

  pkg = require("../../root");

  env = (base = process.env)["CYPRESS_INTERNAL_ENV"] || (base["CYPRESS_INTERNAL_ENV"] = (ref = pkg.env) != null ? ref : "development");

  config = {
    cancellation: true
  };

  if (env === "development") {
    config.longStackTraces = true;
  }

  Promise.config(config);

  try {
    app = require("electron").app;
    app.commandLine.appendSwitch("disable-renderer-backgrounding", true);
    app.commandLine.appendSwitch("ignore-certificate-errors", true);
    app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
    app.commandLine.appendSwitch("use-fake-device-for-media-stream");
    app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
    app.commandLine.appendSwitch("disable-site-isolation-trials");
    if (os.platform() === "linux") {
      app.disableHardwareAcceleration();
    }
    if (process.env.ELECTRON_EXTRA_LAUNCH_ARGS) {
      electronLaunchArguments = process.env.ELECTRON_EXTRA_LAUNCH_ARGS.split(' ');
      electronLaunchArguments.forEach(app.commandLine.appendArgument);
    }
  } catch (error) {
    e = error;
    debug("environment error %s", e.message);
  }

  module.exports = env;

}).call(this);
