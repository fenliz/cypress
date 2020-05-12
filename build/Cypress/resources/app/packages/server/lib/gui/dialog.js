(function() {
  var _, dialog;

  _ = require('lodash');

  dialog = require("electron").dialog;

  module.exports = {
    show: function() {
      var props;
      props = {
        properties: ["openDirectory"]
      };
      return dialog.showOpenDialog(props).then(function(obj) {
        return _.get(obj, ['filePaths', 0]);
      });
    }
  };

}).call(this);
