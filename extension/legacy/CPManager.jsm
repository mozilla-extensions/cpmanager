/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["mozCNGuard"];

const { manager: Cm } = Components;

ChromeUtils.defineModuleGetter(this, "XPCOMUtils",
  "resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyGetter(this, "weaveXPCService", function() {
  return Cc["@mozilla.org/weave/service;1"]
           .getService(Ci.nsISupports)
           .wrappedJSObject;
});

XPCOMUtils.defineLazyModuleGetters(this, {
  ceTrackingOld: "resource://cpmanager-legacy/ceTracking-old.jsm",
  ceTracking: "resource://cpmanager-legacy/ceTracking.jsm",
  ComponentUtils: "resource://gre/modules/ComponentUtils.jsm",
  CustomizableUI: "resource:///modules/CustomizableUI.jsm",
  E10SUtils: "resource://gre/modules/E10SUtils.jsm",
  ExtensionSettingsStore: "resource://gre/modules/ExtensionSettingsStore.jsm",
  FxaSwitcher: "resource://cpmanager-legacy/FxaSwitcher.jsm",
  HomePage: "resource:///modules/HomePage.jsm",
  mozCNSafeBrowsing: "resource://cpmanager-legacy/CNSafeBrowsingRegister.jsm",
  OS: "resource://gre/modules/osfile.jsm",
  PageActions: "resource:///modules/PageActions.jsm",
  PlacesUIUtils: "resource:///modules/PlacesUIUtils.jsm",
  PlacesUtils: "resource://gre/modules/PlacesUtils.jsm",
  Services: "resource://gre/modules/Services.jsm",
  SessionStartup: "resource:///modules/sessionstore/SessionStartup.jsm",
  ShellSvcProxy: "resource://cpmanager-legacy/ShellSvc.jsm",
  ShellSvcStartup: "resource://cpmanager-legacy/ShellSvcStartup.jsm",
  strings: "resource://cpmanager-legacy/ShellSvc.jsm",
  TrackingNotificationInfoBar: "resource://cpmanager-legacy/ceTracking.jsm",
  UIState: "resource://services-sync/UIState.jsm",
  URL2QR: "resource://cpmanager-legacy/URL2QR.jsm",
  Weave: "resource://services-sync/main.js",
});

XPCOMUtils.defineLazyGetter(this, "CETracking", function() {
  return Cc["@mozilla.com.cn/tracking;1"].getService().wrappedJSObject;
});
XPCOMUtils.defineLazyGetter(this, "CETrackingLegacy", function() {
  return Cc["@mozilla.com.cn/tracking-old;1"].getService().wrappedJSObject;
});

XPCOMUtils.defineLazyGetter(this, "gMM", () => {
  return Cc["@mozilla.org/globalmessagemanager;1"].
    getService(Ci.nsIMessageListenerManager || Ci.nsISupports);
});

this.userJSDetection = {
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
      Cu.reportError(ex);
      CETracking.track("userjs-detect-failure");
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
        CETracking.track("userjs-homepage-exists");

        if (val.split("|").some(this.isCEHome)) {
          break;
        }

        CETracking.track("userjs-homepage-other");
        break;
      default:
        break;
    }
  },

  async removeHomepage() {
    try {
      let path = OS.Path.join(OS.Constants.Path.profileDir, "user.js");
      if (!await OS.File.exists(path)) {
        return;
      }
      if (!(await OS.File.stat(path)).size) {
        return;
      }
      let text = await OS.File.read(path, { encoding: "utf-8" });
      let updatedText = text.replace(
        /^\s*user_pref\s*\(\s*("|')browser\.startup\.homepage\1.+\)\s*;\s*$/mg,
        "");
      if (updatedText === text) {
        return;
      }
      await OS.File.writeAtomic(path, updatedText, { encoding: "utf-8" });
    } catch (ex) {
      Cu.reportError(ex);
    }
  },
};

this.buttonRemoval = {
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
    if (PageActions._deferredAddActionCalls) {
      Services.obs.addObserver(this, "browser-delayed-startup-finished");
      return;
    }

    this.removeItForReal();
  },
};

this.pocketButtonRemoval = Object.create(buttonRemoval, {
  prefKey: {
    value: "extensions.cpmanager@mozillaonline.com.pocketButtonRemoved2",
  },
  earlyReturn: {
    value: () => Services.prefs.getChildList("browser.pocket.settings.").length,
  },
  removeItForReal: {
    value() {
      Services.prefs.setBoolPref("extensions.pocket.enabled", false);
      Services.prefs.setBoolPref(this.prefKey, true);
    },
  },
});

this.screenshotButtonRemoval = Object.create(buttonRemoval, {
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

this.dragAndDrop = {
  _frameScript: "resource://cpmanager-legacy/gesture-dragdrop.js",
  _listening: false,
  _messageName: "cpmanager@mozillaonline.com:dragAndDrop",
  _prefKey: "extensions.cmimprove.gesture.enabled",

  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver,
                                          Ci.nsISupportsWeakReference]),

  get enabled() {
    return Services.prefs.getBoolPref(this._prefKey, false);
  },

  init() {
    gMM.loadFrameScript(this._frameScript, true);
    this.toggleListener();
    Services.prefs.addObserver(this._prefKey, this, true);
  },

  observe(subject, topic, data) {
    if (topic === "nsPref:changed") {
      switch (data) {
        case this._prefKey:
          this.toggleListener();
          break;
        default:
          break;
      }
    }
  },

  openLink(browser, link) {
    let gBrowser = browser.ownerGlobal.gBrowser;
    let params = {
      inBackground: true,
      allowThirdPartyFixup: false,
      relatedToCurrent: true,
    };
    gBrowser.addWebTab(link, params);
  },

  receiveMessage(msg) {
    let browser = msg.target,
        data = msg.data && msg.data.data,
        type = msg.data && msg.data.type;
    switch (type) {
      case "image":
      case "link":
        this.openLink(browser, data);
        break;
      case "text":
        this.searchText(browser, data);
        break;
      case "query":
        if (data !== "listening") {
          break;
        }
        try {
          browser.messageManager.sendAsyncMessage(this._messageName, {
            listening: this._listening,
          });
        } catch (ex) {
          browser.ownerGlobal.console.log(browser);
        }
        break;
    }
  },

  searchText(browser, text) {
    var engine = Services.search.defaultEngine;
    if (!engine) {
      browser.ownerGlobal.console.error("No engine available for search");
      return;
    }

    var link = engine.getSubmission(text, null).uri.spec;
    this.openLink(browser, link);
  },

  toggleListener(enabled) {
    if (enabled === undefined) {
      enabled = this.enabled;
    }
    if (!this._listening && enabled) {
      gMM.addMessageListener(this._messageName, this);
      this._listening = true;
    } else if (this._listening && !enabled) {
      gMM.removeMessageListener(this._messageName, this);
      this._listening = false;
    } else {
      Services.console.logStringMessage("dragAndDrop: {listening: " +
        this._listening + ", enabled: " + enabled + "}");
      return;
    }
    gMM.broadcastAsyncMessage(this._messageName, {
      listening: this._listening,
    });
  },

  uninit() {
    Services.prefs.removeObserver(this._prefKey, this);
    this.toggleListener(false);
    gMM.removeDelayedFrameScript(this._frameScript);
  },
};

this.mobileBookmarksHack = {
  id: "mozcn-mobile-bookmarks-button",
  type: "view",
  viewId: "PanelUI-MOA-mobileBookmarksView",
  defaultArea: CustomizableUI.AREA_BOOKMARKS,
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
      track: this._track.bind(this),
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

    var syncState = UIState.get();
    for (let [status, boxId] of [
      [UIState.STATUS_NOT_CONFIGURED,
        "PanelUI-MOA-mobileBookmarks-setupsync"],
      [UIState.STATUS_LOGIN_FAILED,
        "PanelUI-MOA-mobileBookmarks-reauthsync"],
      // FIXME: bug 2617
      // [UIState.STATUS_NOT_VERIFIED,
      //   "PanelUI-MOA-mobileBookmarks-unverified"],
      [UIState.STATUS_SIGNED_IN,
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
          this._track("auth", "show");
        } else {
          this._track("noclients", "show");
        }
        return;
      }
    } else {
      deck.setAttribute("selectedIndex", this.deckIndices.DECKINDEX_BOOKMARKSDISABLED);
      this._track("bookmarksdisabled", "show");
      return;
    }

    evt.preventDefault();
    subView.removeAttribute("current");

    var widget = CustomizableUI.getWidget(this.id).forWindow(win);
    var area = CustomizableUI.getPlacementOfWidget(this.id).area;
    if (area === CustomizableUI.AREA_PANEL || widget.overflowed) {
      var hierarchy = ["AllBookmarks"];
      if (this.mobileQuery) {
        hierarchy.push(this.mobileQuery.itemId);
      }
      win.PlacesCommandHook.showPlacesOrganizer(hierarchy);
      win.PanelUI.hide();
      this._track("places", "show");
      return;
    }

    // delay to run after panelRemover, where anchor.open is set to false
    win.setTimeout(this.showBookmarksPopup, 0, widget);
    this._track("menupopup", "show");
  },

  bookmarksPopupId: "mozcn-mobile-bookmarks-popup",
  deckIndices: {
    "DECKINDEX_BOOKMARKSDISABLED": 0,
    "DECK_INDEX_NOCLIENTS": 1,
  },
  get isConfiguredToSyncBookmarks() {
    if (!weaveXPCService.ready) {
      return true;
    }

    let engine = Weave.Service.engineManager.get("bookmarks");
    return engine && engine.enabled;
  },
  get mobileQuery() {
    delete this.mobileQuery;
    return this.mobileQuery = PlacesUtils.annotations.
      getAnnotationsWithName(PlacesUIUtils.ORGANIZER_QUERY_ANNO, {}).
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
    var widget = CustomizableUI.getWidget(this.id).forWindow(win);
    var mainPopupSet = win.document.getElementById("mainPopupSet");
    switch (evt.type) {
      case "popuphidden":
        if (widget.anchor.open) {
          widget.anchor.open = false;
        }
        mainPopupSet.appendChild(evt.target);
        break;
      case "popupshowing":
        this.maybeAttachPlacesView(evt);
        // set open to true prematurely will trigger unnecessary rebuild
        if (!widget.anchor.open) {
          widget.anchor.open = true;
        }
        break;
      default:
        break;
    }
  },
  init() {
    this.showBookmarksPopup = this._showBookmarksPopup.bind(this);

    CustomizableUI.createWidget(this);
  },
  uninit() {
    CustomizableUI.destroyWidget(this.id);
  },
  maybeAttachPlacesView(evt) {
    if (evt.target.parentNode._placesView) {
      return;
    }

    var win = evt.target.ownerGlobal;
    var query = `place:parent=${PlacesUtils.bookmarks.mobileGuid}`;
    new win.PlacesMenu(evt, query);
  },
  _(strKey) {
    return strings._(strKey.replace("cp.moaMobileBookmarks.",
                                    "mobileBookmarksHack."));
  },
  _openPrefs(win, entrypoint) {
    win.gSync.openPrefs(entrypoint);
  },
  _showBookmarksPopup(widget) {
    var popup = widget.node.ownerDocument.getElementById(this.bookmarksPopupId);
    widget.node.appendChild(popup);
    popup.addEventListener("popuphidden", this);
    popup.addEventListener("popupshowing", this);
    popup.openPopup(widget.anchor, "bottomright topright");
  },
  _track(type, action) {
    CETracking.track(["mbm", type, action || "click"].join("-"));
  },
};

this.distributorChannelHack = {
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

this.trackingProtectionHack = {
  get prefs() {
    let branch = "privacy.trackingprotection.";
    delete this.prefs;
    return this.prefs = Services.prefs.getDefaultBranch(branch);
  },

  async init() {
    this.defaultPrefTweak();

    await ExtensionSettingsStore.initialize();
    ExtensionSettingsStore.removeSetting("cpmanager@mozillaonline.com",
      "prefs", "websites.trackingProtectionMode");
  },

  defaultPrefTweak() {
    this.prefs.setBoolPref("pbmode.enabled", false);
  },
};

this.fxaRelatedHack = {
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
      "browser.vpn_promo.enabled",
    ]) {
      this.prefs.setBoolPref(prefKey, false);
    }

    for (let prefKey of [
      // Deprecated since Fx 99, see https://bugzil.la/1747149
      "browser.newtabpage.activity-stream.asrouter.disable-captive-portal-vpn-promo",
      // Deprecated since Fx 84, see https://bugzil.la/1668965
      "signon.management.page.hideMobileFooter",
    ]) {
      this.prefs.setBoolPref(prefKey, true);
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

    this.prefs.setCharPref(
      "browser.contentblocking.report.mobile-android.url",
      "https://www.firefox.com.cn/mobile/?utm_source=protection_report&utm_content=mobile_promotion"
    );

    let svgContextPref = "svg.context-properties.content.allowed-domains";
    let svgContextDomains = this.prefs.getCharPref(svgContextPref, "");
    let svgContextSet = new Set(svgContextDomains.split(",").filter(domain => {
      return domain !== "";
    }));
    if (svgContextSet.size) {
      svgContextSet.add("profile.firefox.com.cn");
      this.prefs.setCharPref(
        svgContextPref,
        Array.from(svgContextSet).join(",")
      );
    }
  },
};

this.mozCNGuard = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver]),

  // nsIObserver
  observe: function MCG_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "sessionstore-windows-restored":
        Services.obs.removeObserver(this, aTopic);
        this.maybeOpenStartPages();
        break;
      case "prefservice:after-app-defaults":
        mozCNSafeBrowsing.defaultPrefTweak();
        distributorChannelHack.defaultPrefTweak();
        trackingProtectionHack.defaultPrefTweak();
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
    return this.startPage = HomePage.get();
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
      Cu.reportError(ex);
    }
  },

  initWindowListener() {
    for (let win of CustomizableUI.windows) {
      this.onWindowOpened(win);
    }

    CustomizableUI.addListener(this);
  },

  uninitWindowListener() {
    CustomizableUI.removeListener(this);

    for (let win of CustomizableUI.windows) {
      this.onWindowClosed(win);
    }
  },

  onWindowOpened(win) {
    TrackingNotificationInfoBar.init(win, strings);
    URL2QR.init(win, strings);
  },

  onWindowClosed(win) {
    TrackingNotificationInfoBar.uninit(win);
    URL2QR.uninit(win);
  },

  initFactories() {
    Cm.QueryInterface(Ci.nsIComponentRegistrar);

    let constructors = [ceTracking, ceTrackingOld];
    if (ShellSvcStartup.shouldApply) {
      constructors.push(ShellSvcProxy);
    }

    constructors.forEach(targetConstructor => {
      let proto = targetConstructor.prototype;
      // Since Fx 80, see https://bugzil.la/1649554
      let getFactory = XPCOMUtils._getFactory
        ? XPCOMUtils._getFactory.bind(XPCOMUtils)
        : ComponentUtils._getFactory.bind(ComponentUtils);
      let factory = getFactory(targetConstructor);
      this.factories.set(proto.classID, factory);
      Cm.registerFactory(proto.classID, proto.classDescription,
                         proto.contractID, factory);

      for (let xpcom_category of (proto._xpcom_categories || [])) {
        XPCOMUtils.categoryManager.addCategoryEntry(xpcom_category.category,
          (xpcom_category.entry || proto.classDescription),
          (xpcom_category.value || proto.contractID),
          false, true);
      }
    });

    ShellSvcStartup.init();
  },

  uninitFactories() {
    ShellSvcStartup.uninit();

    for (let [classID, factory] of this.factories) {
      Cm.unregisterFactory(classID, factory);
    }
    this.factories = new Map();
  },

  init(context) {
    let isAppStartup = context.extension.startupReason === "APP_STARTUP";
    strings.init(context);

    if (isAppStartup) {
      SessionStartup.onceInitialized.then(() => {
        if (SessionStartup.sessionType != SessionStartup.NO_SESSION) {
          Services.obs.addObserver(this, "sessionstore-windows-restored");
          return;
        }

        this.maybeOpenStartPages();
      });
    }
    Services.obs.addObserver(this, "prefservice:after-app-defaults");

    this.initDefaultPrefs();
    this.initFactories();

    mozCNSafeBrowsing.init();
    userJSDetection.detect();
    userJSDetection.removeHomepage();
    pocketButtonRemoval.init();
    screenshotButtonRemoval.init();
    dragAndDrop.init();
    mobileBookmarksHack.init();
    trackingProtectionHack.init();
    fxaRelatedHack.init();

    CETracking.init(strings);
    CETrackingLegacy.init();
    FxaSwitcher.init(strings);

    // this needs to run after CETracking.init for default prefs
    this.initWindowListener();
  },

  uninit() {
    Services.obs.removeObserver(this, "prefservice:after-app-defaults");

    this.uninitFactories();
    this.uninitWindowListener();

    // mozCNSafeBrowsing.uninit();
    dragAndDrop.uninit();
    mobileBookmarksHack.uninit();

    CETracking.uninit();
    CETrackingLegacy.uninit();
    FxaSwitcher.uninit();

    for (let jsModule of [
      "ceTracking-old",
      "ceTracking",
      "CNSafeBrowsingRegister",
      "FxaSwitcher",
      "ShellSvc",
      "ShellSvcStartup",
      "URL2QR",
    ]) {
      try {
        Cu.unload(`resource://cpmanager-legacy/${jsModule}.jsm`);
      } catch (ex) {
        Cu.reportError(ex);
      }
    }
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
        if (aPage === "about:blank") {
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
              triggeringPrincipal_base64: E10SUtils.SERIALIZED_SYSTEMPRINCIPAL,
            }],
          }));
        }).catch(ex => Cu.reportError(ex));
      });
    }
  },
};
