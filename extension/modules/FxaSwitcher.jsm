/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let EXPORTED_SYMBOLS = ["FxaSwitcher"];

const Ci = Components.interfaces;
const Cu = Components.utils;
const Cc = Components.classes;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this,
  "fxAccounts", "resource://gre/modules/FxAccounts.jsm");
XPCOMUtils.defineLazyModuleGetter(this,
  "Promise", "resource://gre/modules/Promise.jsm");
XPCOMUtils.defineLazyModuleGetter(this,
  "Services", "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this,
  "Weave", "resource://services-sync/main.js");

const DEBUG = 0;

const PREF_SYNC_TOKENSERVER_LEGACY = "services.sync.tokenServerURI";
const PREF_SYNC_TOKENSERVER = "identity.sync.tokenserver.uri";
const PREF_WEBCHANNEL_OBJECT_WHITELIST = "webchannel.allowObject.urlWhitelist";

const PREF_RESTART_FLAG = "extensions.cpmanager@mozilla.com.flag.restart";

const SERVICE_PREFS = {
  "services.sync.fxaccounts.enabled": true
};

let defaultPrefs = Services.prefs.getDefaultBranch("");
[
  "identity.fxaccounts.auth.uri",
  "identity.fxaccounts.remote.email.uri",
  "identity.fxaccounts.remote.force_auth.uri",
  "identity.fxaccounts.remote.oauth.uri",
  "identity.fxaccounts.remote.profile.uri",
  "identity.fxaccounts.remote.signin.uri",
  "identity.fxaccounts.remote.signup.uri",
  "identity.fxaccounts.remote.uri",
  "identity.fxaccounts.remote.webchannel.uri",
  "identity.fxaccounts.settings.devices.uri",
  "identity.fxaccounts.settings.uri",
  PREF_SYNC_TOKENSERVER,
  "services.sync.statusURL",
  "services.sync.fxa.privacyURL",
  "services.sync.fxa.termsURL",
  PREF_SYNC_TOKENSERVER_LEGACY,
  PREF_WEBCHANNEL_OBJECT_WHITELIST
].forEach(function(prefKey) {
  if (defaultPrefs.getPrefType(prefKey) !== Services.prefs.PREF_INVALID) {
    try {
      let defaultVal = defaultPrefs.getCharPref(prefKey);
      let prefVal = defaultVal.replace("https://api.accounts.firefox.com",
                                       "https://api-accounts.firefox.com.cn")
                              .replace("https://accounts.firefox.com",
                                       "https://accounts.firefox.com.cn")
                              .replace("https://oauth.accounts.firefox.com",
                                       "https://oauth.firefox.com.cn")
                              .replace("https://profile.accounts.firefox.com",
                                       "https://profile.firefox.com.cn")
                              .replace("https://token.services.mozilla.com",
                                       "https://sync.firefox.com.cn/token")
                              .replace("https://services.mozilla.com/status/",
                                       "https://accounts.firefox.com.cn/status/");

      SERVICE_PREFS[prefKey] = prefVal;
    } catch (e) {
      Services.prefs.clearUserPref(prefKey);
    }
  }
});

const UT_NO_SYNC_USED    = "ut_no_sync_used";
const UT_FXA_USED        = "ut_fxaccount_used";
const UT_WEAVE_USED      = "ut_weave_used";
const UT_CN_FXA_SWITCHED = "ut_cn_fxa_switched";
const ONE_CHECK_PREF = "cpmanager@mozillaonline.com.switch_fxa_pref.checked";

let _bundles = null;
function _(key) {
  if (!_bundles) {
    _bundles = Services.strings.createBundle("chrome://cmimprove/locale/fxa.properties");
  }

  return _bundles.GetStringFromName(key);
}

function localServiceEnabled() {
  let prefKey = PREF_SYNC_TOKENSERVER_LEGACY;
  if (SERVICE_PREFS[prefKey] === undefined) {
    prefKey = PREF_SYNC_TOKENSERVER;
  }

  return Services.prefs.getCharPref(prefKey) === SERVICE_PREFS[prefKey];
}

function debug(msg) {
  if (DEBUG) {
    Cu.reportError("CP:FXA: " + msg);
  }
}

/**
 * Get the account service usage type of current profile. One of the
 * const values with prefix UT_* is returned.
 */
function getUsageType(aSkipSwitched) {
  let { promise, resolve } = Promise.defer()

  if ((!aSkipSwitched) && localServiceEnabled()) {
    resolve(UT_CN_FXA_SWITCHED);
    return promise;
  }

  // Borrow some codes from chrome://browser/content/preferences/sync.js
  let service = Cc["@mozilla.org/weave/service;1"]
                  .getService(Ci.nsISupports)
                  .wrappedJSObject;

  debug("Weave status: " + Weave.Status);

  // If fxAccountsEnabled is false, fxa is in a "not configured" state.
  if (service.fxAccountsEnabled) {
    fxAccounts.getSignedInUser().then(function(data) {
      if (data) {
        debug("Fxa data: " + JSON.stringify(data));
        resolve(UT_FXA_USED);
      } else {
        resolve(UT_NO_SYNC_USED);
      }
    });
  } else if (typeof Weave == "undefined") {
    // No Weave object.
    resolve(UT_NO_SYNC_USED);
  } else if (Weave.Status.service == Weave.CLIENT_NOT_CONFIGURED ||
             Weave.Svc.Prefs.get("firstSync", "") == "notReady") {
    // No Weave accounts.
    resolve(UT_NO_SYNC_USED);
  } else if (Weave.Status.login == Weave.LOGIN_FAILED_INVALID_PASSPHRASE ||
             Weave.Status.login == Weave.LOGIN_FAILED_LOGIN_REJECTED) {
    // Weave login failed.
    resolve(UT_WEAVE_USED);
  } else {
    resolve(UT_WEAVE_USED);
  }

  return promise;
}

function resetFxaServices() {
  if (!localServiceEnabled()) {
    return;
  }

  Object.keys(SERVICE_PREFS).forEach(function(key) {
    Services.prefs.clearUserPref(key);
  });
}


function onlySyncBookmark() {
  let toDecline = ["addons", "history", "passwords", "prefs", "tabs"];

  toDecline.forEach(aKey => {
    Services.prefs.setBoolPref("services.sync.engine." + aKey, false);
  });
  toDecline = toDecline.join(",");
  Services.prefs.setCharPref("services.sync.declinedEngines", toDecline);
}

function repairOnlySyncBookmark() {
  getUsageType(true).then(aType => {
    if (aType !== UT_NO_SYNC_USED) {
      return;
    }

    let prefix = "services.sync.engineStatusChanged.";
    Services.prefs.getChildList(prefix).forEach(aKey => {
      Services.prefs.clearUserPref(aKey);
    });

    onlySyncBookmark();
  });
}

function switchToLocalService(aExcludeFxAPrefs) {
  Object.keys(SERVICE_PREFS).forEach(function(key) {
    if (aExcludeFxAPrefs && (key.startsWith("identity.fxaccounts.") ||
                             key === PREF_WEBCHANNEL_OBJECT_WHITELIST)) {
      return;
    }

    if (typeof SERVICE_PREFS[key] == "string") {
      Services.prefs.setCharPref(key, SERVICE_PREFS[key]);
    } else if (typeof SERVICE_PREFS[key] == "boolean") {
      Services.prefs.setBoolPref(key, SERVICE_PREFS[key]);
    }
  });
}

function alreadyChecked() {
  try {
    return Services.prefs.getBoolPref(ONE_CHECK_PREF, false);
  } catch (e) {
    return false;
  }
}

function markChecked() {
  Services.prefs.setBoolPref(ONE_CHECK_PREF, true);
}

function repairPrefs() {
  // Fix the potential mismatch between fxa and sync prefs
  var hasLocalPref = false,
      hasLocalFxAPref = false;

  for (let key in SERVICE_PREFS) {
    if (hasLocalPref && hasLocalFxAPref) {
      break;
    }

    let isLocalValue = false;
    try {
      if (typeof SERVICE_PREFS[key] == "string") {
        isLocalValue = Services.prefs.getCharPref(key) === SERVICE_PREFS[key];
      } else if (typeof SERVICE_PREFS[key] == "boolean") {
        isLocalValue = Services.prefs.getBoolPref(key) === SERVICE_PREFS[key];
      }
    } catch (e) {}

    if (isLocalValue) {
      hasLocalPref = true;
      if (key.startsWith("identity.fxaccounts.") ||
          key === PREF_WEBCHANNEL_OBJECT_WHITELIST) {
        hasLocalFxAPref = true;
      }
    }
  }

  if (hasLocalPref) {
    debug("change it back.");
    // One case of the mismatch, global fxa + local sync, is actually usable.
    // We'll keep it as is for now, pending a decision from bug 1645.
    switchToLocalService(!hasLocalFxAPref);
  }
}

function init() {
  // Complete unfinished jobs before FF restarted.
  doUnfinishedJobs();

  repairPrefs();

  if (alreadyChecked()) {
    repairOnlySyncBookmark();
    done();
    return;
  }

  getUsageType().then(aType => {
    debug("user type: " + aType + "\n");
    switch (aType) {
      case UT_NO_SYNC_USED:
      case UT_WEAVE_USED:
        switchToLocalService();
        onlySyncBookmark();
        break;
      default:
        debug("Ignore for " + aType);
        break;
    }
  }).then(() => {
    debug("Switch prefs done.");
    markChecked();
    done();
  }, e => {
    debug("error: " + e);
    done();
  });
}

let statusListener = [];
let isDone = false;

function done() {
  isDone = true;
  statusListener.forEach(callback => {
    try {
      callback();
    } catch (e) {}
  });
}

function doUnfinishedJobs() {
  try {
    if (!Services.prefs.getBoolPref(PREF_RESTART_FLAG, false)) {
      return;
    }
  } catch (e) {
    return;
  }

  Services.prefs.clearUserPref(PREF_RESTART_FLAG);
  doSendTrack();
}

function sendTrackIfAllowed() {
  // Only mark pref, do tracking after FF restarted.
  Services.prefs.setBoolPref(PREF_RESTART_FLAG, true);
}

function doSendTrack() {
  var tracker = Cc["@mozilla.com.cn/tracking;1"];
  if (!tracker || !tracker.getService().wrappedJSObject.ude) {
    return;
  }

  let url = "http://addons.g-fox.cn/fxa-switch.gif?fxa=" + localServiceEnabled();
  let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].
              createInstance(Ci.nsIXMLHttpRequest);

  xhr.onload = function() {
    debug("Stats sent: " + url);
  };

  xhr.open("GET", url, true);
  xhr.send();
}

let FxaSwitcher = {
  topic: "sync-pane-loaded",
  /**
   * This along with addStatusListener/removeStatusListener are used by passport addon,
   * in case we didn't finish fxa entries checking/switching before passport addon
   * start migration process.
   */
  get isDone() {
    return isDone;
  },

  addStatusListener(listener) {
    if (!statusListener.includes(listener)) {
      statusListener.push(listener);
    }
  },

  removeStatusListener(listener) {
    let index = statusListener.indexOf(listener);
    if (index > -1) {
      statusListener.splice(index, 1);
    }
  },

  resetFxaServices() {
    let title = _("fxa.confirm.title.switchToGlobal");
    let body = _("fxa.confirm.body.switchToGlobal");
    if (Services.prompt.confirm(null, title, body)) {
      resetFxaServices();
      sendTrackIfAllowed();
      Cc["@mozilla.org/toolkit/app-startup;1"].getService(Ci.nsIAppStartup)
        .quit(Ci.nsIAppStartup.eForceQuit | Ci.nsIAppStartup.eRestart);
    }
  },

  switchToLocalService() {
    let title = _("fxa.confirm.title.switchToLocal");
    let body = _("fxa.confirm.body.switchToLocal");
    if (Services.prompt.confirm(null, title, body)) {
      switchToLocalService();
      sendTrackIfAllowed();
      // Restart anyway.
      Cc["@mozilla.org/toolkit/app-startup;1"].getService(Ci.nsIAppStartup)
        .quit(Ci.nsIAppStartup.eForceQuit | Ci.nsIAppStartup.eRestart);
    }
  },

  get strings() {
    let spec = "chrome://cmimprove/locale/fxa.properties";
    delete this.strings;
    return this.strings = Services.strings.createBundle(spec);
  },

  _(key, args) {
    key = "fxa.preferences." + key;
    return args ?
      this.strings.formatStringFromName(key, args, args.length) :
      this.strings.GetStringFromName(key);
  },

  handleEvent(evt) {
    switch (evt.type) {
      case "click":
        if (localServiceEnabled()) {
          this.resetFxaServices();
        } else {
          this.switchToLocalService();
        }
        break;
      default:
        break;
    }
  },

  init() {
    init();

    Services.obs.addObserver(this, this.topic);
  },

  observe(subject, topic, data) {
    if (topic !== this.topic) {
      return;
    }

    let self = this;
    subject.mozCNSyncHack = {
      onSyncToEnablePref(checkbox) {
        if (checkbox.checked) {
          return undefined;
        }

        let p = Services.prompt;
        let shouldDisable = p.confirmEx(checkbox.ownerGlobal,
          self._("warning.title", [checkbox.label]),
          self._("warning.message", [checkbox.label]),
          p.STD_YES_NO_BUTTONS + p.BUTTON_POS_1_DEFAULT + p.BUTTON_DELAY_ENABLE,
          "", "", "", null, {}) === 0;

        if (!shouldDisable) {
          checkbox.checked = true;
        }
      }
    };

    let doc = subject.document;

    let noFxaAccount = doc.getElementById("noFxaAccount");
    let label = doc.createElement("label");
    label.classList.add("text-link");
    let target = localServiceEnabled() ? "Global" : "Local";
    label.setAttribute("value", this._(`label.switchTo${target}`));
    label.addEventListener("click", this);
    noFxaAccount.appendChild(label);

    if (localServiceEnabled()) {
      let caption = doc.querySelector("#fxaGroup > caption:first-child");
      caption.querySelector("label").textContent = this._("caption.label");
    }

    let selector = 'checkbox[preference^="engine."]';
    [].filter.call(doc.querySelectorAll(selector), checkbox => {
      return doc.getElementById(checkbox.getAttribute("preference")).
        name.startsWith("services.sync.engine.");
    }).forEach(checkbox => {
      if (checkbox.hasAttribute("onsynctopreference")) {
        return;
      }

      checkbox.setAttribute("onsynctopreference",
        "return mozCNSyncHack.onSyncToEnablePref(this);");
    });
  },

  uninit() {
    Services.obs.removeObserver(this, this.topic);
  }
};
