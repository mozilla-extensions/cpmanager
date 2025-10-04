/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  FxAccountsConfig: "resource://gre/modules/FxAccountsConfig.sys.mjs",

  // Internal modules
  mozCNSafeBrowsing: "resource://cpmanager-legacy/CNSafeBrowsingRegister.sys.mjs",
  strings: "resource://cpmanager-legacy/strings.sys.mjs",
});

const userJSDetection = {
  async removeHomepage() {
    try {
      let profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile).path;
      let path = PathUtils.join(profileDir, "user.js");
      if (!await IOUtils.exists(path)) {
        return;
      }
      if (!(await IOUtils.stat(path)).size) {
        return;
      }
      let text = await IOUtils.readUTF8(path);
      let updatedText = text.replace(
        /^\s*user_pref\s*\(\s*("|')browser\.startup\.homepage\1.+\)\s*;\s*$/mg,
        "");
      if (updatedText === text) {
        return;
      }
      await IOUtils.writeUTF8(path, updatedText);
    } catch (ex) {
      console.error(ex);
    }
  },
};

const distributorChannelHack = {
  distributionTopic: "distribution-customization-complete",
  normalizedChannels: {
    "stub.firefox.com.cn": "mainWinStub",
    "stub.esr.firefox.com.cn": "mainWinStub",
    "firefox.baidusd": "baidu",
    "firefox.baidu": "baidu",
    "firefox.3gj": "qihoo",
    "firefox-win64.3gj": "qihoo",
    "full.firefox.com.cn": "mainWinFull",
    "full.firefox-win64.com.cn": "mainWinFull",
    "www.firefox.com.cn": "unknown",
    "firefox.others": "others",
    "firefox-win64.others": "others",
    "firefox.com.cn": "mainOther",
    "firefox.latest": "mainWinStubFallback",
    "firefox.xbsafe2": "xbsafe",
    "stub.firefox.xiazaiba": "xiazaiba",
    "firefox.kis": "kingsoft",
  },
  get prefs() {
    delete this.prefs;
    return this.prefs = Services.prefs.getDefaultBranch("app.");
  },
  prefSource: "chinaedition.channel",
  prefTarget: "distributor.channel",

  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver,
                                          Ci.nsISupportsWeakReference]),

  _maybeOverrideDistributorChannel() {
    // wait until both prefs are set by distribution.ini
    // also do nothing if it's already something other than "chinaedition"
    if (this.prefs.getPrefType(this.prefSource) !== this.prefs.PREF_STRING ||
        this.prefs.getPrefType(this.prefTarget) !== this.prefs.PREF_STRING ||
        this.prefs.getCharPref(this.prefTarget) !== "chinaedition") {
      return;
    }

    let sourceVal = this.prefs.getCharPref(this.prefSource);
    let targetVal = this.normalizedChannels[sourceVal] || "unspecified";
    this.prefs.setCharPref(this.prefTarget, targetVal);
  },

  defaultPrefTweak() {
    let observers = Services.obs.enumerateObservers(this.distributionTopic);
    if (observers.hasMoreElements()) {
      Services.obs.addObserver(this, this.distributionTopic);
      this.prefs.addObserver("", this, true);
    } else {
      this._maybeOverrideDistributorChannel();
    }
  },

  observe(subject, topic, data) {
    switch (topic) {
      case this.distributionTopic:
        Services.obs.removeObserver(this, topic);
        this.prefs.removeObserver("", this);
        break;
      case "nsPref:changed":
        if (data === this.prefSource ||
            data === this.prefTarget) {
          this._maybeOverrideDistributorChannel();
        }
        break;
      default:
        break;
    }
  },
};

let fxaRelatedHack = {
  get prefs() {
    delete this.prefs;
    return this.prefs = Services.prefs.getDefaultBranch("");
  },

  init() {
    this.defaultPrefTweak();
  },

  async defaultPrefTweak() {
    // Disable promos not relevant for this distro
    for (let prefKey of [
      // instead of setting the proper "browser.contentblocking.report.manage_devices.url"
      "browser.contentblocking.report.lockwise.enabled",
      "browser.contentblocking.report.monitor.enabled",
      "browser.promo.focus.enabled",
      "browser.vpn_promo.enabled",
    ]) {
      this.prefs.setBoolPref(prefKey, false);
    }

    const PREF_ACTIVITYSTREAM = "browser.newtabpage.activity-stream.fxaccounts.endpoint";

    //Resets the default FxA prefs
    if (Services.prefs.getCharPref("identity.fxaccounts.auth.uri").includes("firefox.com.cn")) {
      [
        PREF_ACTIVITYSTREAM,
        "identity.fxaccounts.auth.uri",
        "identity.fxaccounts.autoconfig.uri",
        "identity.fxaccounts.contextParam",
        "identity.fxaccounts.oauth.enabled",
        "identity.fxaccounts.remote.root",
        "identity.fxaccounts.remote.oauth.uri",
        "identity.fxaccounts.remote.profile.uri",
        "identity.fxaccounts.remote.pairing.uri",
        "identity.sync.tokenserver.uri",
      ].forEach(key => this.prefs.clearUserPref(key));

      // Reset derived config URLs to product defaults
      lazy.FxAccountsConfig.resetConfigURLs();

      // Ensure any cached/configured values re-compute using defaults
      await lazy.FxAccountsConfig.ensureConfigured();
    }

    // A special case is for the distribution.ini prefs
    if (Services.prefs.getCharPref(PREF_ACTIVITYSTREAM, "").includes("firefox.com.cn")) {
      this.prefs.setCharPref(PREF_ACTIVITYSTREAM, "https://accounts.firefox.com/");
      Services.prefs.clearUserPref(PREF_ACTIVITYSTREAM);
    }
  },
};

export var mozCNGuard = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver]),

  // nsIObserver
  observe: function MCG_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "prefservice:after-app-defaults":
        lazy.mozCNSafeBrowsing.defaultPrefTweak();
        distributorChannelHack.defaultPrefTweak();
        fxaRelatedHack.defaultPrefTweak();
        break;
    }
  },

  initDefaultPrefs() {
    try {
      let defBranch = Services.prefs.getDefaultBranch("");

      defBranch.setBoolPref("extensions.cmimprove.gesture.enabled", false);
      defBranch.setBoolPref("extensions.cmimprove.url2qr.enabled", true);
    } catch (ex) {
      console.error(ex);
    }
  },

  init(context) {
    lazy.strings.init(context);
    Services.obs.addObserver(this, "prefservice:after-app-defaults");

    this.initDefaultPrefs();

    lazy.mozCNSafeBrowsing.init();
    userJSDetection.removeHomepage();
    fxaRelatedHack.init();
  },

  uninit() {
    Services.obs.removeObserver(this, "prefservice:after-app-defaults");
  },
};
