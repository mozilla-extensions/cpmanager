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

// TODO: What is this?!?
const mobileBookmarksHack = {
  id: "mozcn-mobile-bookmarks-button",
  type: "view",
  viewId: "PanelUI-MOA-mobileBookmarksView",
  defaultArea: lazy.CustomizableUI.AREA_BOOKMARKS,
  get label() {
    delete this.label;
    return this.label = Services.strings.
      createBundle("chrome://places/locale/places.properties").
      GetStringFromName("MobileBookmarksFolderTitle");
  },
  get tooltiptext() {
    delete this.tooltiptext;
    return this.tooltiptext = this.label;
  },
  onBeforeCreated(doc) {
    let win = doc.defaultView;

    win.MOA = win.MOA || {};
    win.MOA.Improve = win.MOA.Improve || {};
    win.MOA.Improve.MobileBookmarks = win.MOA.Improve.MobileBookmarks || {
      openPrefs: this._openPrefs.bind(this),
    };

    let winUtils = win.windowUtils;
    winUtils.loadSheet(this.styleSheet, winUtils.AUTHOR_SHEET);

    let parent = doc.getElementById("appMenu-multiView");

    let panelview = doc.createXULElement("panelview");
    panelview.id = this.viewId;
    panelview.className = "PanelUI-subView";
    panelview.setAttribute("flex", "1");

    let body = doc.createXULElement("vbox");
    body.className = "panel-subview-body";

    let main = doc.createXULElement("vbox");
    main.id = "PanelUI-MOA-mobileBookmarks-main";
    main.setAttribute("hidden", "true");

    let deck = doc.createXULElement("deck");
    deck.id = "PanelUI-MOA-mobileBookmarks-deck";

    for (let { id, titleKey, labelKey, buttonKey, command } of [{
      id: "PanelUI-MOA-mobileBookmarks-bookmarksdisabledpane",
      titleKey: "bookmarksnotsyncing",
      labelKey: "bookmarksnotsyncing",
      buttonKey: "enablebookmarkssync",
      command: "Services.prefs.setBoolPref('services.sync.engine.bookmarks', true); MOA.Improve.MobileBookmarks.track('bookmarksdisabled');",
    }, {
      id: "PanelUI-MOA-mobileBookmarks-nodevicespane",
      titleKey: "noclients",
      labelKey: "generic",
      buttonKey: "mobilePromo",
      command: "window.openWebLinkIn('http://www.firefox.com.cn/mobile/?utm_source=firefox-browser&utm_medium=firefox-browser&utm_campaign=moa-mobile-bookmarks', 'tab'); MOA.Improve.MobileBookmarks.track('noclients');",
    }]) {
      let pane = doc.createXULElement("hbox");
      pane.id = id;
      pane.setAttribute("pack", "center");
      pane.setAttribute("flex", "1");

      let vbox = doc.createXULElement("vbox");
      vbox.className = "PanelUI-MOA-mobileBookmarks-instruction-box";
      vbox.setAttribute("align", "center");

      let imageBox = doc.createXULElement("hbox");
      imageBox.setAttribute("pack", "center");

      let image = doc.createXULElement("image");
      image.className = "fxaSyncIllustration";
      imageBox.appendChild(image);
      vbox.appendChild(imageBox);

      let title = doc.createXULElement("label");
      title.className = "PanelUI-MOA-mobileBookmarks-instruction-title";
      title.textContent = this._(`cp.moaMobileBookmarks.${titleKey}.title`);
      vbox.appendChild(title);

      let label = doc.createXULElement("label");
      label.className = "PanelUI-MOA-mobileBookmarks-instruction-label";
      label.textContent = this._(`cp.moaMobileBookmarks.${labelKey}.label`);
      vbox.appendChild(label);

      let buttonBox = doc.createXULElement("hbox");
      buttonBox.setAttribute("pack", "center");

      let button = doc.createXULElement("toolbarbutton");
      button.className = "PanelUI-MOA-mobileBookmarks-prefs-button";
      button.setAttribute("label", this._(`cp.moaMobileBookmarks.${buttonKey}.label`));
      button.setAttribute("oncommand", command);
      buttonBox.appendChild(button);
      vbox.appendChild(buttonBox);
      pane.appendChild(vbox);
      deck.appendChild(pane);
    }

    main.appendChild(deck);
    body.appendChild(main);

    let secondary = doc.createXULElement("hbox");
    secondary.setAttribute("pack", "center");
    secondary.setAttribute("flex", "1");

    for (let { id } of [{
      id: "PanelUI-MOA-mobileBookmarks-setupsync",
    }, {
      id: "PanelUI-MOA-mobileBookmarks-reauthsync",
    }]) {
      let vbox = doc.createXULElement("vbox");
      vbox.id = id;
      vbox.className = "PanelUI-MOA-mobileBookmarks-instruction-box";
      vbox.setAttribute("align", "center");
      vbox.setAttribute("flex", "1");
      vbox.setAttribute("hidden", "true");

      let image = doc.createXULElement("image");
      image.className = "fxaSyncIllustration";
      vbox.appendChild(image);

      let title = doc.createXULElement("label");
      title.className = "PanelUI-MOA-mobileBookmarks-instruction-title";
      title.textContent = this._("cp.moaMobileBookmarks.notsignedin.title");
      vbox.appendChild(title);

      let label = doc.createXULElement("label");
      label.className = "PanelUI-MOA-mobileBookmarks-instruction-label";
      label.textContent = this._("cp.moaMobileBookmarks.generic.label");
      vbox.appendChild(label);

      let button = doc.createXULElement("toolbarbutton");
      button.className = "PanelUI-MOA-mobileBookmarks-prefs-button";
      button.setAttribute("label", this._("cp.moaMobileBookmarks.signin.label"));
      button.setAttribute("oncommand", "MOA.Improve.MobileBookmarks.openPrefs(window, 'moa-mobile-bookmarks'); MOA.Improve.MobileBookmarks.track('auth');");
      vbox.appendChild(button);
      secondary.appendChild(vbox);
    }

    body.appendChild(secondary);
    panelview.appendChild(body);
    parent.appendChild(panelview);

    let mainPopupSet = doc.getElementById("mainPopupSet");
    let menupopup = doc.createXULElement("menupopup");
    menupopup.id = this.bookmarksPopupId;
    menupopup.setAttribute("placespopup", "true");
    menupopup.setAttribute("context", "placesContext");
    menupopup.setAttribute("oncommand", "BookmarksEventHandler.onCommand(event, this.parentNode._placesView);");
    menupopup.setAttribute("onclick", "BookmarksEventHandler.onClick(event, this.parentNode._placesView);");
    menupopup.setAttribute("onpopupshowing", "if (!this.parentNode._placesView) {new PlacesMenu(event, `place:parent=${lazy.PlacesUtils.bookmarks.mobileGuid}`);} if (!this.parentNode.open) {this.parentNode.open = true;}");
    menupopup.setAttribute("tooltip", "bhTooltip");
    menupopup.setAttribute("popupsinherittooltip", "true");
    mainPopupSet.appendChild(menupopup);
  },
  onDestroyed(doc) {
    let win = doc.defaultView;

    delete win.MOA.Improve.MobileBookmarks;
    if (!Object.keys(win.MOA.Improve).length) {
      delete win.MOA.Improve;
    }
    if (!Object.keys(win.MOA).length) {
      delete win.MOA;
    }

    let winUtils = win.windowUtils;
    winUtils.removeSheet(this.styleSheet, winUtils.AUTHOR_SHEET);

    let panelview = doc.getElementById(this.viewId);
    panelview.remove();

    let menupopup = doc.getElementById(this.bookmarksPopupId);
    menupopup.remove();
  },
  onViewShowing(evt) {
    var subView = evt.target;
    var win = subView.ownerGlobal;

    var syncState = lazy.UIState.get();
    for (let [status, boxId] of [
      [lazy.UIState.STATUS_NOT_CONFIGURED,
        "PanelUI-MOA-mobileBookmarks-setupsync"],
      [lazy.UIState.STATUS_LOGIN_FAILED,
        "PanelUI-MOA-mobileBookmarks-reauthsync"],
      // FIXME: bug 2617
      // [lazy.UIState.STATUS_NOT_VERIFIED,
      //   "PanelUI-MOA-mobileBookmarks-unverified"],
      [lazy.UIState.STATUS_SIGNED_IN,
        "PanelUI-MOA-mobileBookmarks-main"],
    ]) {
      win.document.getElementById(boxId).hidden = (status != syncState.status);
    }

    var deck = subView.querySelector("#PanelUI-MOA-mobileBookmarks-deck");
    if (this.isConfiguredToSyncBookmarks) {
      let prefKey = win.BookmarkingUI.MOBILE_BOOKMARKS_PREF;
      if (!Services.prefs.getBoolPref(prefKey, false)) {
        deck.setAttribute("selectedIndex", this.deckIndices.DECK_INDEX_NOCLIENTS);
        if (win.document.getElementById("PanelUI-MOA-mobileBookmarks-main").hidden) {
        }
        return;
      }
    } else {
      deck.setAttribute("selectedIndex", this.deckIndices.DECKINDEX_BOOKMARKSDISABLED);
      return;
    }

    evt.preventDefault();
    subView.removeAttribute("current");

    var widget = lazy.CustomizableUI.getWidget(this.id).forWindow(win);
    var area = lazy.CustomizableUI.getPlacementOfWidget(this.id).area;
    if (area === lazy.CustomizableUI.AREA_PANEL || widget.overflowed) {
      var hierarchy = ["AllBookmarks"];
      if (this.mobileQuery) {
        hierarchy.push(this.mobileQuery.itemId);
      }
      win.PlacesCommandHook.showPlacesOrganizer(hierarchy);
      win.PanelUI.hide();
      return;
    }

    // delay to run after panelRemover, where anchor.open is set to false
    win.setTimeout(this.showBookmarksPopup, 0, widget);
  },

  bookmarksPopupId: "mozcn-mobile-bookmarks-popup",
  deckIndices: {
    "DECKINDEX_BOOKMARKSDISABLED": 0,
    "DECK_INDEX_NOCLIENTS": 1,
  },
  get isConfiguredToSyncBookmarks() {
    if (!lazy.weaveXPCService.ready) {
      return true;
    }

    let engine = lazy.Weave.Service.engineManager.get("bookmarks");
    return engine && engine.enabled;
  },
  get mobileQuery() {
    delete this.mobileQuery;
    return this.mobileQuery = lazy.PlacesUtils.annotations.
      getAnnotationsWithName(lazy.PlacesUIUtils.ORGANIZER_QUERY_ANNO, {}).
      filter(function(annotation) {
        return annotation.annotationValue === "MobileBookmarks";
      })[0];
  },
  get styleSheet() {
    let spec = "resource://cpmanager-legacy/skin/mobile_bookmarks.css";
    delete this.styleSheet;
    return this.styleSheet = Services.io.newURI(spec);
  },
  handleEvent(evt) {
    // current/original/explicitOriginal ??
    if (evt.target.id !== this.bookmarksPopupId) {
      return;
    }
    evt.target.removeEventListener(evt.type, this);

    var win = evt.target.ownerGlobal;
    var widget = lazy.CustomizableUI.getWidget(this.id).forWindow(win);
    var mainPopupSet = win.document.getElementById("mainPopupSet");
    switch (evt.type) {
      case "popuphidden":
        if (widget.anchor.open) {
          widget.anchor.open = false;
        }
        mainPopupSet.appendChild(evt.target);
        break;
      default:
        break;
    }
  },
  init() {
    this.showBookmarksPopup = this._showBookmarksPopup.bind(this);

    lazy.CustomizableUI.createWidget(this);
  },
  uninit() {
    lazy.CustomizableUI.destroyWidget(this.id);
  },
  updateMobileBookmarks(aNode, aContainer) {
    if (aNode.id !== this.id) {
      return;
    }

    let isBookmarkItem = aContainer && aContainer.id == "PersonalToolbar";
    aNode.classList.toggle("toolbarbutton-1", !isBookmarkItem);
    aNode.classList.toggle("bookmark-item", isBookmarkItem);
  },
  _(strKey) {
    return lazy.strings._(strKey.replace("cp.moaMobileBookmarks.",
                                    "mobileBookmarksHack."));
  },
  _openPrefs(win, entrypoint) {
    win.gSync.openPrefs(entrypoint);
  },
  _showBookmarksPopup(widget) {
    var popup = widget.node.ownerDocument.getElementById(this.bookmarksPopupId);
    widget.node.appendChild(popup);
    popup.addEventListener("popuphidden", this);
    popup.openPopup(widget.anchor, "bottomright topright");
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
