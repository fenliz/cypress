(function() {
  var api, cache, debug, errors, keys;

  debug = require("debug")("cypress:server:user");

  api = require("./api");

  cache = require("./cache");

  errors = require("./errors");

  keys = require("./util/keys");

  module.exports = {
    get: function() {
      return cache.getUser();
    },
    getSafely: function() {
      return this.get().tap(function(user) {
        if (user.authToken) {
          return user.authToken = keys.hide(user.authToken);
        }
      });
    },
    set: function(user) {
      return cache.setUser(user);
    },
    getBaseLoginUrl: function() {
      return api.getAuthUrls().get('dashboardAuthUrl');
    },
    logOut: function() {
      return this.get().then(function(user) {
        var authToken;
        authToken = user && user.authToken;
        return cache.removeUser().then(function() {
          if (authToken) {
            return api.postLogout(authToken);
          }
        });
      });
    },
    syncProfile: function(authToken) {
      debug("synchronizing user profile");
      return api.getMe(authToken).then((function(_this) {
        return function(res) {
          var user;
          debug("received /me %o", res);
          user = {
            authToken: authToken,
            name: res.name,
            email: res.email
          };
          return _this.set(user)["return"](user);
        };
      })(this));
    },
    ensureAuthToken: function() {
      return this.get().then(function(user) {
        var at, error;
        if (user && (at = user.authToken)) {
          debug("found authToken %s", at);
          return at;
        } else {
          error = errors.get("NOT_LOGGED_IN");
          error.isApiError = true;
          throw error;
        }
      });
    }
  };

}).call(this);
