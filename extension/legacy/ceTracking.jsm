this.EXPORTED_SYMBOLS = [
  "ceTracking",
  "TrackingNotificationInfoBar"
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.importGlobalProperties(["XMLHttpRequest"]);

const _CID = Components.ID("{C40350A8-F734-4CFF-99D9-95274D408143}");
const _CONTRACTID = "@mozilla.com.cn/tracking;1";
const USAGE_URI = "http://addons.g-fox.cn/tk.gif";

const PK_PREF = "extensions.cpmanager@mozillaonline.com.uuid";

XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

function LOG(txt) {
  Services.console.logStringMessage("tracking: " + txt);
}

function usageDataEnabled() {
  try {
    return !Services.prefs.getBoolPref("extensions.cpmanager.tracking.notification.show") &&
            Services.prefs.getBoolPref("extensions.cpmanager.tracking.enabled");
  } catch (e) {
    return false;
  }
}

function generateUUID() {
  return Cc["@mozilla.org/uuid-generator;1"]
          .getService(Ci.nsIUUIDGenerator)
          .generateUUID()
          .number;
}
function isUUID(str) {
  return str.length == 38;
}

// profile key
function getPK() {
  let uuid = "";
  try {
    uuid = Services.prefs.getCharPref(PK_PREF);
    if (!isUUID(uuid)) {
      throw "invalid uuid [" + uuid + "]";
    }
  } catch (e) {
    uuid = generateUUID();
    Services.prefs.setCharPref(PK_PREF, uuid);
  }
  return encodeURIComponent(uuid);
}

function isDefaultBrowser(aForAllTypes) {
  try {
    return Cc["@mozilla.org/browser/shell-service;1"]
             .getService(Components.interfaces.nsIShellService)
             .isDefaultBrowser(false, aForAllTypes);
  } catch (e) {
    return null;
  }
}

function httpGet(url) {
  try {
    let xmlHttpRequest = new XMLHttpRequest();
    xmlHttpRequest.open("GET", url, true);
    xmlHttpRequest.send(null);
    xmlHttpRequest.onload = function() {
      LOG("httpGet:load");
    };
    xmlHttpRequest.onerror = function() {
      LOG("httpGet:error");
    };
  } catch (e) {
    LOG(e);
  }
}

function sendUsageData(data) {
  let str = "";
  for (let i in data) {
    str += "&" + i + "=" + data[i];
  }

  try {
    /**
     * detect if Fx was set/locked as default with 3rd party software.
     * check against sdb-openhelp-*, not the {after,before} suffix.
     */
    let match = /\&sdb-attempt-([\d.]+)-[ab]=/.exec(str);
    if (match) {
      str += ("&sdb-quit-" + match[1] + "=" + isDefaultBrowser(true));
    }
  } catch (e) {}

  if (str == "") {
    return;
  }
  let tracking_random = Math.random();
  str = USAGE_URI + "?when=quit&r=" + tracking_random + str;
  httpGet(str);
}

let TrackingNotificationInfoBar = {
  _DATA_CHOICES_NOTIFICATION: "cp-data-tracking",
  _prefKey: "extensions.cpmanager.tracking.notification.show",
  _win: null,

  get _notificationBox() {
    delete this._notificationBox;
    return this._notificationBox = this._win.
      document.getElementById("global-notificationbox");
  },

  _(key, args) {
    return this._strings._(key, args);
  },

  init(win, strings) {
    if (this._win) {
      return;
    }
    this._strings = strings;
    this._win = win;

    if (!Services.prefs.getBoolPref(this._prefKey, false) ||
        !Services.prefs.getBoolPref("extensions.cpmanager.tracking.enabled", false)) {
      return;
    }
    this._showNotification();
  },

  _getDataChoicesNotification(name = this._DATA_CHOICES_NOTIFICATION) {
    return this._notificationBox.getNotificationWithValue(name);
  },

  _showNotification() {
    if (this._getDataChoicesNotification()) {
      return;
    }

    let doc = this._win.document;
    let brandBundle = doc.getElementById("bundle_brand");
    let appName = brandBundle.getString("brandShortName");

    let message = this._("TrackingNotificationInfoBar.message", [appName]);

    let label = this._("TrackingNotificationInfoBar.button.label");
    let accessKey = this._("TrackingNotificationInfoBar.button.accessKey");
    let buttons = [{
      label,
      accessKey,
      popup: null,
      callback: () => {
        let origin = "dataReporting";
        this._win.openPreferences("privacy-reports", { origin });
      },
    }];

    this._notificationBox.appendNotification(
      message,
      this._DATA_CHOICES_NOTIFICATION,
      null,
      this._notificationBox.PRIORITY_INFO_HIGH,
      buttons,
      event => {
        Services.prefs.setBoolPref(this._prefKey, false);
        if (event == "removed") {
          this._clearNotification();
        }
      }
    );
  },

  _clearNotification() {
    let notification = this._getDataChoicesNotification();
    if (notification) {
      notification.close();
    }
  },

  uninit(win) {
    if (win !== this._win) {
      return;
    }

    this._clearNotification();
    delete this._strings;
  }
};

function ceTracking() {
  this.wrappedJSObject = this;
}

ceTracking.prototype = {
  classDescription: "Tracking for Imporve Firefox",
  contractID: _CONTRACTID,
  classID: _CID,
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  // tracking key:count
  data: {},

  _(key) {
    return this._strings._(key);
  },

  trackPrefs(key, value) {
    this.data[key] = value;
  },

  track(key) {
    if (typeof this.data[key] == "number") {
      this.data[key] ++;
    } else {
      this.data[key] = 1;
    }
  },

  get ude() {
    return usageDataEnabled();
  },

  send(url) {
    if (this.ude) {
      httpGet(url);
    }
    return this.ude;
  },

  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "privacy-pane-loaded":
        this.addPrefs(aSubject);
        break;
      case "quit-application":
        if (this.ude) {
          sendUsageData(this.data);
        }
        break;
    }
  },

  init(strings) {
    this._strings = strings;
    let defBranch = Services.prefs.getDefaultBranch("");

    defBranch.setBoolPref("extensions.cpmanager.tracking.notification.show", true);
    defBranch.setBoolPref("extensions.cpmanager.tracking.enabled", true);
    defBranch.setCharPref("extensions.cpmanager.tracking.infoURL",
      "http://www.firefox.com.cn/about/participate/#user-privacy");

    Services.obs.addObserver(this, "privacy-pane-loaded");
    Services.obs.addObserver(this, "quit-application");

    // seems to be an attempt to cache the dns record?
    if (this.ude) {
      let tracking_random = Math.random();
      let str = USAGE_URI + "?when=run&r=" + tracking_random;
      httpGet(str);
    }
  },

  uninit(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }

    Services.obs.removeObserver(this, "quit-application");
    delete this._strings;
  },

  addPrefs(win) {
    let doc = win.document;

    // Since Fx 59, https://bugzil.la/1379338
    let prefs = doc.getElementById("privacyPreferences");
    let id = "extensions.cpmanager.tracking.enabled";
    let type = "bool";
    if (!prefs) {
      win.Preferences.addAll([
        { id, type }
      ]);
    } else {
      let pref = doc.createElement("preference");
      pref.id = id;
      pref.setAttribute("name", id);
      pref.setAttribute("type", type);
      prefs.appendChild(pref);
    }

    let body = doc.getElementById("dataCollectionGroup");
    let parent = body.querySelector('[data-subcategory="reports"]') || body;
    let hbox = doc.createElement("hbox");
    hbox.setAttribute("align", "center");

    let checkbox = doc.createElement("checkbox");
    checkbox.classList.add("tail-with-learn-more");
    checkbox.setAttribute("preference", id);
    checkbox.setAttribute("label", this._("ceTracking.label"));
    checkbox.setAttribute("accesskey", this._("ceTracking.accesskey"));

    let label = doc.createElement("label");
    label.id = "mococnTrackingLearnMore";
    label.classList.add("learnMore");
    label.classList.add("text-link");
    label.textContent = this._("ceTracking.learnMore.label");

    hbox.appendChild(checkbox);
    hbox.appendChild(label);
    parent.appendChild(hbox);

    win.gPrivacyPane.
      _setupLearnMoreLink("extensions.cpmanager.tracking.infoURL", label.id);
  }
}
