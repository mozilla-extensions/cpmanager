/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global globalThis */
this.EXPORTED_SYMBOLS = [
  "ceTracking",
  "TrackingNotificationInfoBar",
];

const _CID = Components.ID("{C40350A8-F734-4CFF-99D9-95274D408143}");
const _CONTRACTID = "@mozilla.com.cn/tracking;1";
const USAGE_URI = "http://addons.g-fox.cn/tk.gif";

ChromeUtils.defineModuleGetter(this, "AsyncShutdown",
  "resource://gre/modules/AsyncShutdown.jsm");

const keyedCount = {};
// Since Fx 104, see https://bugzil.la/1667455,1780695
const Services =
  globalThis.Services ||
  ChromeUtils.import("resource://gre/modules/Services.jsm").Services;

function usageDataEnabled() {
  try {
    return !Services.prefs.getBoolPref("extensions.cpmanager.tracking.notification.show") &&
            Services.prefs.getBoolPref("extensions.cpmanager.tracking.enabled");
  } catch (e) {
    return false;
  }
}

function isDefaultBrowser(aForAllTypes) {
  try {
    return Cc["@mozilla.org/browser/shell-service;1"]
             .getService(Ci.nsIShellService)
             .isDefaultBrowser(false, aForAllTypes);
  } catch (e) {
    return null;
  }
}

async function httpGet(url) {
  return new Promise(resolve => {
    try {
      let xmlHttpRequest = new XMLHttpRequest();
      xmlHttpRequest.open("GET", url, true);
      xmlHttpRequest.send(null);
      xmlHttpRequest.timeout = 5e3;
      xmlHttpRequest.onloadend = resolve;
    } catch (ex) {
      Cu.reportError(ex);
      resolve();
    }
  });
}

async function sendUsageData() {
  if (!usageDataEnabled()) {
    return "Tracking disabled";
  }

  let str = "";
  for (let i in keyedCount) {
    str += "&" + i + "=" + keyedCount[i];
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
    return "Nothing to track";
  }

  let tracking_random = Math.random();
  str = USAGE_URI + "?when=quit&r=" + tracking_random + str;
  return httpGet(str);
}

let TrackingNotificationInfoBar = {
  _DATA_CHOICES_NOTIFICATION: "cp-data-tracking",
  _prefKey: "extensions.cpmanager.tracking.notification.show",
  _strings: null,
  _win: null,

  get _notificationBox() {
    delete this._notificationBox;
    return this._notificationBox = this._win.gNotificationBox;
  },

  _(key, args) {
    return this._strings ? this._strings._(key, args) : "";
  },

  init(win, strings) {
    try {
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
    } catch (ex) {
      this._win.console.error(ex);
    }
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

    let notificationBox = this._notificationBox;
    let eventCallback = event => {
      Services.prefs.setBoolPref(this._prefKey, false);
      if (event == "removed") {
        this._clearNotification();
      }
    };

    // Since Fx 94, see https://bugzil.la/1690390
    if (notificationBox.isShown !== undefined) {
      notificationBox.appendNotification(
        this._DATA_CHOICES_NOTIFICATION,
        {
          label: message,
          image: null,
          priority: notificationBox.PRIORITY_INFO_HIGH,
          eventCallback,
        },
        buttons
      );
    } else {
      notificationBox.appendNotification(
        message,
        this._DATA_CHOICES_NOTIFICATION,
        null,
        notificationBox.PRIORITY_INFO_HIGH,
        buttons,
        eventCallback
      );
    }
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

    this._strings = null;
    this._win = null;
  },
};

function ceTracking() {
  this.wrappedJSObject = this;
}

ceTracking.prototype = {
  classDescription: "Tracking for Imporve Firefox",
  contractID: _CONTRACTID,
  classID: _CID,
  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver,
                                          Ci.nsISupportsWeakReference]),

  _(key) {
    return this._strings._(key);
  },

  trackPrefs(key, value) {
    keyedCount[key] = value;
  },

  track(key) {
    if (typeof keyedCount[key] == "number") {
      keyedCount[key]++;
    } else {
      keyedCount[key] = 1;
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
    }
  },

  init(strings) {
    this._strings = strings;
    let defBranch = Services.prefs.getDefaultBranch("");

    defBranch.setBoolPref("extensions.cpmanager.tracking.notification.show", true);
    defBranch.setBoolPref("extensions.cpmanager.tracking.enabled", true);
    defBranch.setCharPref("extensions.cpmanager.tracking.infoURL",
      "https://www.firefox.com.cn/about/participate/#user-privacy");

    Services.obs.addObserver(this, "privacy-pane-loaded");

    AsyncShutdown.quitApplicationGranted.addBlocker(
      "ceTracking shutdown", sendUsageData);
  },

  uninit() {
    AsyncShutdown.quitApplicationGranted.removeBlocker(sendUsageData);
    delete this._strings;
  },

  addPrefs(win) {
    let doc = win.document;

    let id = "extensions.cpmanager.tracking.enabled";
    let type = "bool";
    win.Preferences.addAll([
      { id, type },
    ]);

    let body = doc.getElementById("dataCollectionGroup");
    let parent = body.querySelector('[data-subcategory="reports"]') || body;
    let hbox = doc.createXULElement("hbox");
    hbox.setAttribute("align", "center");

    let checkbox = doc.createXULElement("checkbox");
    checkbox.classList.add("tail-with-learn-more");
    checkbox.setAttribute("preference", id);
    checkbox.setAttribute("label", this._("ceTracking.label"));
    checkbox.setAttribute("accesskey", this._("ceTracking.accesskey"));

    let label = doc.createXULElement("label", { is: "text-link" });
    label.id = "mococnTrackingLearnMore";
    label.classList.add("learnMore");
    label.textContent = this._("ceTracking.learnMore.label");

    hbox.appendChild(checkbox);
    hbox.appendChild(label);
    parent.appendChild(hbox);

    win.gPrivacyPane.
      _setupLearnMoreLink("extensions.cpmanager.tracking.infoURL", label.id);
  },
};
