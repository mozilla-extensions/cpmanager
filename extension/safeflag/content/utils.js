/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(function() {
  var ns = MOA.ns('SafeFlag.Utils');
  var Ci = Components.interfaces;
  var Cc = Components.classes;

  ns.getCurrentWindow = function() {
    return Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator).getMostRecentWindow("navigator:browser");
  };

  ns.getCurrentURI = function() {
    return this.getCurrentWindow().getBrowser().currentURI;
  };

  ns.get = function(id) {
    return document.getElementById(id);
  };

  // extend object
  ns.extend = function(src, target) {
    for (var key in src) {
      target[key] = src[key];
    }
    return target;
  };

  ns.bindFunc = function(func, context) {
    var __method = func, args = Array.prototype.slice.call(arguments, 2);
    return function() {
      return __method.apply(context, args.concat(Array.prototype.slice.call(arguments)));
    }
  };

  ns.getPrefs = function() {
    var oldBranch = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefService).getBranch('safeflag.');
    var newBranch = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefService).getBranch('extensions.safeflag.');
    if (oldBranch.getChildList('', {}).length) {
      ['background.safe', 'background.unsafe'].forEach(function(key) {
        if (oldBranch.prefHasUserValue(key)) {
          newBranch.setBoolPref(key, oldBranch.getBoolPref(key))
        }
      });
      oldBranch.deleteBranch('')
    }
    return newBranch;
  };

  // Returns a string version of an exception object with its stack trace
  function parseException(e) {
    if (!e)
      return "";
    else if (!e.stack)
      return String(e);
    else
      return String(e) + " \n" + String(e.stack);
  }

  ns.error = function(msg, exception) {
    Components.utils.reportError(msg + ' \n' + parseException(exception));
  };

  ns.PrefListener = function(branchName, onChanged) {
    var branch = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch).getBranch(branchName);
    branch.QueryInterface(Ci.nsIPrefBranch2);
    branch.addObserver('', this, false);

    this.unregister = function() {
      if (branch) {
        branch.removeObserver('', this);
      }
      branch = null;
    };

    this.observe = function(subject, topic, data) {
      MOA.debug('subject: ' + subject);
      if (topic == 'nsPref:changed') {
        onChanged(branch, data);
      }
    };
  };

  ns.getString = function(stringID) {
    var stringBundle = document.getElementById("safeflag-strings");
    return stringBundle.getString(stringID)
  };
})();
