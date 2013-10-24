const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const prefKey = "extensions.cpmanager@mozillaonline.com.qvod_hao123_ts";
const trackingURL = "http://addons.g-fox.cn/qvod-hao123.gif?r=";

function logAndTrack(aMessage) {
  Services.console.logStringMessage("Dropping " + aMessage);

  var ts = Date.now() / 86400e3;
  var reference = ts;
  try {
    reference = Services.prefs.getIntPref(prefKey);
  } catch(e) {}
  if (ts < reference) {
    return;
  }

  var xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
              .createInstance(Ci.nsIXMLHttpRequest);
  var url = trackingURL + Math.random();
  xhr.open("GET", url, true);
  xhr.send();
  xhr.onload = function() {
    Services.prefs.setIntPref(prefKey, Math.floor(ts) + 1);
  };
}

function CPCommandLineValidator() {
}

CPCommandLineValidator.prototype = {
  classID: Components.ID("{eada4c5c-6b7a-486b-8492-5297ba7a189e}"),

  /* nsISupports */
  QueryInterface : XPCOMUtils.generateQI([Ci.nsICommandLineValidator]),

  _flagsToValidate: [
    "-chrome",
    "-new-tab",
    "-new-window",
    "-remote",
    "-url"
  ],

  _urlsToDrop: [
    "http://www.hao123.com/?tn=29065018_59_hao_pg"
  ],

  _shouldDrop: function(aCmdLine, aArgument) {
    try {
      aArgument = aCmdLine.resolveURI(aArgument).spec;
    } catch(e) {};

    return this._urlsToDrop.some(function(aUrlToDrop) {
      return aArgument.indexOf(aUrlToDrop) > -1;
    });
  },

  /* nsICommandLineValidator */
  validate : function cclv_validate(cmdLine) {
    if (cmdLine.state != cmdLine.STATE_INITIAL_LAUNCH) {
      return;
    }

    for (var current = 0, total = cmdLine.length; current < total;) {
      var argument = cmdLine.getArgument(current);
      /*
       * cmdLine.handleFlag will remove them, so flags are detected, retrieved
       * and removed using argument related methods.
       */
      if (this._flagsToValidate.indexOf(argument) > -1) {
        var paramAsArg = cmdLine.getArgument(current + 1);
        if (this._shouldDrop(cmdLine, paramAsArg)) {
          logAndTrack(argument + " " + paramAsArg);
          cmdLine.removeArguments(current, current + 1);
          total -= 2;
        } else {
          current += 2;
        }
      } else {
        if (this._shouldDrop(cmdLine, argument)) {
          logAndTrack(argument);
          cmdLine.removeArguments(current, current);
          total -= 1;
        } else {
          current += 1;
        }
      }
    }
  },
};

var components = [CPCommandLineValidator];
this.NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
