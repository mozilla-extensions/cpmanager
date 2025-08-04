/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { manager: Cm } = Components;

const { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

const lazy = {};

XPCOMUtils.defineLazyServiceGetter(lazy, "weaveXPCService", () => {
  return Cc["@mozilla.org/weave/service;1"]
           .getService(Ci.nsISupports)
           .wrappedJSObject;
});

ChromeUtils.defineESModuleGetters(lazy, {
  ComponentUtils: "resource://gre/modules/ComponentUtils.sys.mjs",
  CustomizableUI: "resource:///modules/CustomizableUI.sys.mjs",
  E10SUtils: "resource://gre/modules/E10SUtils.sys.mjs",
  ExtensionSettingsStore: "resource://gre/modules/ExtensionSettingsStore.sys.mjs",
  HomePage: "resource:///modules/HomePage.sys.mjs",
  PageActions: "resource:///modules/PageActions.sys.mjs",
  PlacesUIUtils: "moz-src:///browser/components/places/PlacesUIUtils.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  SessionStartup: "resource:///modules/sessionstore/SessionStartup.sys.mjs",
  UIState: "resource://services-sync/UIState.sys.mjs",
  Weave: "resource://services-sync/main.sys.mjs",

  // Internal modules
  FxaSwitcher: "resource://cpmanager-legacy/FxaSwitcher.sys.mjs",
  mozCNSafeBrowsing: "resource://cpmanager-legacy/CNSafeBrowsingRegister.sys.mjs",
  strings: "resource://cpmanager-legacy/strings.sys.mjs",
  URL2QR: "resource://cpmanager-legacy/URL2QR.sys.mjs",
  GestureDragDropParent: "resource://cpmanager-legacy/GestureDragDropParent.sys.mjs",
});

const userJSDetection = {
  get sandbox() {
    let nullprincipal = Services.scriptSecurityManager.createNullPrincipal({});

    let sandbox = Cu.Sandbox(nullprincipal);
    sandbox.user_pref = this.userPref.bind(this);

    delete this.sandbox;
    return this.sandbox = sandbox;
  },

  detect() {
    try {
      let userJS = Services.dirsvc.get("ProfD", Ci.nsIFile);
      userJS.append("user.js");
      if (!userJS.exists()) {
        return;
      }

      let userJSURI = Services.io.newFileURI(userJS);
      Services.scriptloader.loadSubScriptWithOptions(userJSURI.spec, {
        charset: "UTF-8",
        ignoreCache: true,
        target: this.sandbox,
      });
    } catch (ex) {
      console.error(ex);
    }
  },

  isCEHome(aURL) {
    let spec = aURL;
    try {
      spec = Services.io.newURI(spec).asciiSpec;
    } catch (e) {
      try {
        spec = Services.uriFixup.getFixupURIInfo(spec,
          Ci.nsIURIFixup.FIXUP_FLAG_NONE).preferredURI.asciiSpec;
      } catch (e) {}
    }

    return [
      /^about:cehome$/,
      /^https?:\/\/[a-z]+\.firefoxchina\.cn\/?$/,
    ].some((aExpectedSpec) => {
      return aExpectedSpec.test(spec);
    });
  },

  userPref(key, val) {
    switch (key) {
      case "browser.startup.homepage":
        if (val.split("|").some(this.isCEHome)) {
          break;
        }

        break;
      default:
        break;
    }
  },

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

const buttonRemoval = {
  id: "dummy-button-id",
  prefKey: "dummy-pref-key",
  earlyReturn() {
    return false;
  },

  init() {
    if (this.earlyReturn()) {
      return;
    }

    if (Services.prefs.getBoolPref(this.prefKey, false)) {
      return;
    }

    this.removeIt();
  },

  observe(subject, topic, data) {
    // PageActions initialized in the first window, wait a bit before remove it
    Services.obs.removeObserver(this, topic);
    Services.tm.dispatchToMainThread(() => {
      this.removeItForReal();
    });
  },

  removeIt() {
    // PageActions not initialized, potential conflict with cached addAction
    if (lazy.PageActions._deferredAddActionCalls) {
      Services.obs.addObserver(this, "browser-delayed-startup-finished");
      return;
    }

    this.removeItForReal();
  },
};

const screenshotButtonRemoval = Object.create(buttonRemoval, {
  prefKey: {
    value: "extensions.cpmanager@mozillaonline.com.screenshotButtonRemoved",
  },
  earlyReturn: {
    value() {
      return Services.prefs.getBoolPref("extensions.screenshots.disabled", false);
    },
  },
  removeItForReal: {
    value() {
      Services.prefs.setBoolPref("extensions.screenshots.disabled", true);
      Services.prefs.setBoolPref(this.prefKey, true);
    },
  },
});

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

  defaultPrefTweak() {
    for (let prefKey of [
      // instead of setting the proper "browser.contentblocking.report.manage_devices.url"
      "browser.contentblocking.report.lockwise.enabled",
      "browser.contentblocking.report.monitor.enabled",
      "browser.promo.focus.enabled",
      "browser.vpn_promo.enabled",
    ]) {
      this.prefs.setBoolPref(prefKey, false);
    }

    for (let prefKey of [
      // Deprecated since Fx 99, see https://bugzil.la/1747149
      "browser.privatebrowsing.vpnpromourl",
      "identity.fxaccounts.service.monitorLoginUrl",
      // Deprecated since Fx 81, see https://bugzil.la/1657626
      "identity.fxaccounts.service.sendLoginUrl",
    ]) {
      this.prefs.setCharPref(prefKey, "");
    }
  },
};

export var mozCNGuard = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver]),

  // nsIObserver
  observe: function MCG_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "sessionstore-windows-restored":
        Services.obs.removeObserver(this, aTopic);
        this.maybeOpenStartPages();
        break;
      case "prefservice:after-app-defaults":
        lazy.mozCNSafeBrowsing.defaultPrefTweak();
        distributorChannelHack.defaultPrefTweak();
        fxaRelatedHack.defaultPrefTweak();
        break;
    }
  },

  factories: new Map(),

  get browserHandler() {
    delete this.browserHandler;
    return this.browserHandler = Cc["@mozilla.org/browser/clh;1"].
      getService(Ci.nsIBrowserHandler);
  },

  get startPage() {
    delete this.startPage;
    return this.startPage = lazy.HomePage.get();
  },

  get startPageChoice() {
    delete this.startPageChoice;
    return this.startPageChoice = Services.prefs.
      getIntPref("browser.startup.page", "badpref");
  },

  initDefaultPrefs() {
    try {
      let defBranch = Services.prefs.getDefaultBranch("");

      defBranch.setBoolPref("extensions.cmimprove.gesture.enabled", true);
      defBranch.setBoolPref("extensions.cmimprove.url2qr.enabled", true);
      defBranch.setBoolPref("extensions.cmimprove.fxa.enabled", true);
    } catch (ex) {
      console.error(ex);
    }
  },

  initWindowListener() {
    for (let win of lazy.CustomizableUI.windows) {
      this.onWindowOpened(win);
    }

    lazy.CustomizableUI.addListener(this);
    mobileBookmarksHack.init();
  },

  uninitWindowListener() {
    mobileBookmarksHack.uninit();
    lazy.CustomizableUI.removeListener(this);

    for (let win of lazy.CustomizableUI.windows) {
      this.onWindowClosed(win);
    }
  },

  onWidgetBeforeDOMChange(
    aNode,
    aNextNode,
    aContainer,
    aIsRemoval
  ) {
    mobileBookmarksHack.updateMobileBookmarks(aNode, aIsRemoval ? null : aContainer);
  },

  onWindowOpened(win) {
    lazy.URL2QR.init(win, lazy.strings);
  },

  onWindowClosed(win) {
    lazy.URL2QR.uninit(win);
  },

  initFactories() {
    Cm.QueryInterface(Ci.nsIComponentRegistrar);
  },

  uninitFactories() {
    for (let [classID, factory] of this.factories) {
      Cm.unregisterFactory(classID, factory);
    }
    this.factories = new Map();
  },

  init(context) {
    let isAppStartup = context.extension.startupReason === "APP_STARTUP";
    lazy.strings.init(context);

    if (isAppStartup) {
      lazy.SessionStartup.onceInitialized.then(() => {
        if (lazy.SessionStartup.sessionType != lazy.SessionStartup.NO_SESSION) {
          Services.obs.addObserver(this, "sessionstore-windows-restored");
          return;
        }

        this.maybeOpenStartPages();
      });
    }
    Services.obs.addObserver(this, "prefservice:after-app-defaults");

    this.initDefaultPrefs();
    this.initFactories();

    lazy.mozCNSafeBrowsing.init();
    userJSDetection.detect();
    userJSDetection.removeHomepage();
    screenshotButtonRemoval.init();
    fxaRelatedHack.init();
    lazy.FxaSwitcher.init(lazy.strings);

    this.initWindowListener();
  },

  uninit() {
    Services.obs.removeObserver(this, "prefservice:after-app-defaults");

    this.uninitFactories();
    this.uninitWindowListener();

    // lazy.mozCNSafeBrowsing.uninit();

    lazy.FxaSwitcher.uninit();
  },

  isCEHome: function MCG_isCEHome(aSpec) {
    return [
      /^about:cehome$/,
      /^https?:\/\/[a-z]+\.firefoxchina\.cn\/?$/,
    ].some((aExpectedSpec) => {
      return aExpectedSpec.test(aSpec);
    });
  },

  maybeOpenStartPages: function MCG_maybeOpenStartPages() {
    let w = Services.wm.getMostRecentWindow("navigator:browser");

    if (this.startPageChoice != 1) {
      return;
    }

    let argumentsZero = w.arguments && w.arguments[0];
    if (this.browserHandler.defaultArgs == argumentsZero) {
      return;
    }

    if (argumentsZero instanceof Ci.nsIMutableArray) {
      let len = argumentsZero.Count(), externalURLs = [];
      for (let i = 0; i < len; i++) {
        let urisstring = argumentsZero.GetElementAt(i)
                                      .QueryInterface(Ci.nsISupportsString);
        let uri = Services.io.newURI(urisstring.data);
        externalURLs.push(uri.asciiSpec);
      }

      this.startPage.split("|").forEach((aPage, aIndex) => {
        // Since Fx 108, see https://bugzil.la/1676492
        if (
          aPage === "chrome://browser/content/blanktab.html" ||
          aPage === "about:blank"
        ) {
          return;
        }

        let uri = Services.io.newURI(aPage);
        let title;

        // Don't open if already in commandline argument.
        if (externalURLs.some(function(externalURL) {
          return externalURL.split("?")[0] == uri.asciiSpec.split("?")[0];
        })) {
          return;
        }

        if (this.isCEHome(aPage)) {
          aPage = uri.asciiSpec + "?from=extra_start";
          title = "\u706b\u72d0\u4e3b\u9875";
        }

        w.PlacesUtils.history.fetch(uri.spec).then(info => {
          title = info && info.title;
        }).then(() => {
          let tab = w.gBrowser.addWebTab();
          w.gBrowser.moveTabTo(tab, aIndex);
          w.SessionStore.setTabState(tab, JSON.stringify({
            entries: [{
              url: aPage,
              title,
              triggeringPrincipal_base64: lazy.E10SUtils.SERIALIZED_SYSTEMPRINCIPAL,
            }],
          }));
        }).catch(ex => console.error(ex));
      });
    }
  },
};
