/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals APP_SHUTDOWN, APP_STARTUP */

const {
  classes: Cc, interfaces: Ci, manager: Cm,
  results: Cr, utils: Cu
} = Components;

Cu.importGlobalProperties(["URL"]);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyGetter(this, "weaveXPCService", function() {
  return Cc["@mozilla.org/weave/service;1"]
           .getService(Ci.nsISupports)
           .wrappedJSObject;
});
XPCOMUtils.defineLazyModuleGetter(this, "Weave",
  "resource://services-sync/main.js");
XPCOMUtils.defineLazyModuleGetter(this, "Utils",
  "resource://gre/modules/sessionstore/Utils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "URL2QR",
  "resource://cpmanager/URL2QR.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "TrackingNotificationInfoBar",
  "resource://cpmanager/ceTracking.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "ShortcutUtils",
  "resource://gre/modules/ShortcutUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "ShellSvcStartup",
  "resource://cpmanager/ShellSvcStartup.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "ShellSvcProxy",
  "resource://cpmanager/ShellSvc.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PlacesUtils",
  "resource://gre/modules/PlacesUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PlacesUIUtils",
  "resource:///modules/PlacesUIUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "OS",
  "resource://gre/modules/osfile.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "mozCNSafeBrowsing",
  "resource://cpmanager/CNSafeBrowsingRegister.jsm");
XPCOMUtils.defineLazyServiceGetter(this, "gMM",
  "@mozilla.org/globalmessagemanager;1", "nsIMessageListenerManager");
XPCOMUtils.defineLazyModuleGetter(this, "FxaSwitcher",
  "resource://cpmanager/FxaSwitcher.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "ExtensionSettingsStore",
  "resource://gre/modules/ExtensionSettingsStore.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "CustomizableUI",
  "resource:///modules/CustomizableUI.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "ceTracking",
  "resource://cpmanager/ceTracking.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "ceTrackingOld",
  "resource://cpmanager/ceTracking-old.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "ceClearHistory",
  "resource://cpmanager/ceClearHistory.jsm");

XPCOMUtils.defineLazyGetter(this, "CETracking", function() {
  return Cc["@mozilla.com.cn/tracking;1"].getService().wrappedJSObject;
});
XPCOMUtils.defineLazyGetter(this, "CETrackingLegacy", function() {
  return Cc["@mozilla.com.cn/tracking-old;1"].getService().wrappedJSObject;
});

this.userJSDetection = {
  get sandbox() {
    let nullprincipal = Cc["@mozilla.org/nullprincipal;1"].
      createInstance(Ci.nsIPrincipal);

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
        target: this.sandbox
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
      /^https?:\/\/[a-z]+\.firefoxchina\.cn\/?$/
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
  }
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

  removeIt() {
    CustomizableUI.addListener(this);
  },

  onAreaNodeRegistered(aArea) {
    if (aArea !== CustomizableUI.AREA_NAVBAR) {
      return;
    }

    Services.prefs.setBoolPref(this.prefKey, true);
    CustomizableUI.removeListener(this);

    let placementArea = CustomizableUI.getPlacementOfWidget(this.id);
    if (!placementArea || placementArea.area !== CustomizableUI.AREA_NAVBAR) {
      return;
    }

    if (!CustomizableUI.isWidgetRemovable(this.id)) {
      return;
    }
    CustomizableUI.removeWidgetFromArea(this.id);
  }
};

this.pocketButtonRemoval = Object.create(buttonRemoval, {
  prefKey: {
    value: "extensions.cpmanager@mozillaonline.com.pocketButtonRemoved2"
  },
  earlyReturn: {
    value: () => Services.prefs.getChildList("browser.pocket.settings.").length
  },
  removeIt: {
    value() {
      Services.prefs.setBoolPref("extensions.pocket.enabled", false);
      Services.prefs.setBoolPref(this.prefKey, true);
    }
  }
});

this.screenshotButtonRemoval = Object.create(buttonRemoval, {
  prefKey: {
    value: "extensions.cpmanager@mozillaonline.com.screenshotButtonRemoved"
  },
  earlyReturn: {
    value() {
      return Services.prefs.getBoolPref("extensions.screenshots.disabled", false);
    }
  },
  removeIt: {
    value() {
      Services.prefs.setBoolPref("extensions.screenshots.disabled", true);
      Services.prefs.setBoolPref(this.prefKey, true);
    }
  }
});

this.dragAndDrop = {
  _frameScript: "chrome://cmimprove/content/gesture/dragdrop.js",
  _listening: false,
  _messageName: "cpmanager@mozillaonline.com:dragAndDrop",
  _prefKey: "extensions.cmimprove.gesture.enabled",

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),

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
    browser.ownerGlobal.gBrowser.loadOneTab(link, {
      inBackground: true,
      allowThirdPartyFixup: false,
      relatedToCurrent: true
    });
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
            listening: this._listening
          });
        } catch (ex) {
          browser.ownerGlobal.console.log(browser);
        }
        break;
    }
  },

  searchText(browser, text) {
    var engine = Services.search.currentEngine;
    if (!engine) {
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
      listening: this._listening
    })
  },

  uninit() {
    Services.prefs.removeObserver(this._prefKey, this);
    this.toggleListener(false);
    gMM.removeDelayedFrameScript(this._frameScript);
  }
};

this.bookmarkingUIHack = {
  get strings() {
    let spec = "chrome://cmimprove/locale/browser.properties";
    delete this.strings;
    return this.strings = Services.strings.createBundle(spec);
  },
  patchBrowserWindow(win) {
    let bmb_vbt = win.document.getElementById("BMB_viewBookmarksToolbar");
    if (bmb_vbt) {
      let origLabel = bmb_vbt.getAttribute("label");
      bmb_vbt.setAttribute("label", this._getString("menu.bookmarksToolbar"));
      bmb_vbt.setAttribute("orig-label", origLabel);
    }

    if (win.BookmarkingUI) {
      let args = [ShortcutUtils.prettifyShortcut(win.document.
        getElementById(win.BookmarkingUI.BOOKMARK_BUTTON_SHORTCUT))];
      let unstarredTooltip = this._getString("starButtonOff.tooltip2", args);

      win.BookmarkingUI.__defineGetter__("_unstarredTooltip", function() {
        delete this._unstarredTooltip;
        return this._unstarredTooltip = unstarredTooltip;
      });
    }
  },
  unpatchBrowserWindow(win) {
    let bmb_vbt = win.document.getElementById("BMB_viewBookmarksToolbar");
    if (bmb_vbt) {
      let origLabel = bmb_vbt.getAttribute("orig-label");
      if (origLabel) {
        bmb_vbt.setAttribute("label", origLabel);
        bmb_vbt.removeAttribute("orig-label");
      }
    }

    if (win.BookmarkingUI) {
      let unstarredTooltip = win.BookmarkingUI.
        _getFormattedTooltip("starButtonOff.tooltip2");

      win.BookmarkingUI.__defineGetter__("_unstarredTooltip", function() {
        delete this._unstarredTooltip;
        return this._unstarredTooltip = unstarredTooltip;
      });
    }
  },
  _getString(id, args) {
    if (args) {
      return this.strings.formatStringFromName(id, args, args.length);
    }
    return this.strings.GetStringFromName(id);
  }
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
      track: this._track.bind(this)
    };

    let winUtils = this.getWinUtils(win);
    winUtils.loadSheet(this.styleSheet, winUtils.AUTHOR_SHEET);

    let parent = doc.getElementById("appMenu-multiView") ||
                 doc.getElementById("PanelUI-multiView");

    let panelview = doc.createElement("panelview");
    panelview.id = this.viewId;
    panelview.className = "PanelUI-subView";
    panelview.setAttribute("flex", "1");

    let body = doc.createElement("vbox");
    body.className = "panel-subview-body";

    let main = doc.createElement("vbox");
    main.id = "PanelUI-MOA-mobileBookmarks-main";
    main.setAttribute("observes", "sync-syncnow-state");

    let deck = doc.createElement("deck");
    deck.id = "PanelUI-MOA-mobileBookmarks-deck";

    for (let { id, titleKey, labelKey, buttonKey, command } of [{
      id: "PanelUI-MOA-mobileBookmarks-bookmarksdisabledpane",
      titleKey: "bookmarksnotsyncing",
      labelKey: "bookmarksnotsyncing",
      buttonKey: "enablebookmarkssync",
      command: "gPrefService.setBoolPref('services.sync.engine.bookmarks', true); MOA.Improve.MobileBookmarks.track('bookmarksdisabled');"
    }, {
      id: "PanelUI-MOA-mobileBookmarks-nodevicespane",
      titleKey: "noclients",
      labelKey: "generic",
      buttonKey: "mobilePromo",
      command: "openUILinkIn('http://www.firefox.com.cn/?utm_source=firefox-browser&amp;utm_medium=firefox-browser&amp;utm_campaign=moa-mobile-bookmarks#android', 'tab'); MOA.Improve.MobileBookmarks.track('noclients');"
    }]) {
      let pane = doc.createElement("hbox");
      pane.id = id;
      pane.setAttribute("pack", "center");
      pane.setAttribute("flex", "1");

      let vbox = doc.createElement("vbox");
      vbox.className = "PanelUI-MOA-mobileBookmarks-instruction-box";

      let imageBox = doc.createElement("hbox");
      imageBox.setAttribute("pack", "center");

      let image = doc.createElement("image");
      image.className = "fxaSyncIllustration";
      image.setAttribute("src", "chrome://browser/skin/fxa/sync-illustration.svg");
      imageBox.appendChild(image);
      vbox.appendChild(imageBox);

      let title = doc.createElement("label");
      title.className = "PanelUI-MOA-mobileBookmarks-instruction-title";
      title.textContent = this._(`cp.moaMobileBookmarks.${titleKey}.title`);
      vbox.appendChild(title);

      let label = doc.createElement("label");
      label.className = "PanelUI-MOA-mobileBookmarks-instruction-label";
      label.textContent = this._(`cp.moaMobileBookmarks.${labelKey}.label`);
      vbox.appendChild(label);

      let buttonBox = doc.createElement("hbox");
      buttonBox.setAttribute("pack", "center");

      let button = doc.createElement("toolbarbutton");
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

    let secondary = doc.createElement("hbox");
    secondary.setAttribute("pack", "center");
    secondary.setAttribute("flex", "1");

    for (let { id, observes } of [{
      id: "PanelUI-MOA-mobileBookmarks-setupsync",
      observes: "sync-setup-state"
    }, {
      id: "PanelUI-MOA-mobileBookmarks-reauthsync",
      observes: "sync-reauth-state"
    }]) {
      let vbox = doc.createElement("vbox");
      vbox.id = id;
      vbox.className = "PanelUI-MOA-mobileBookmarks-instruction-box";
      vbox.setAttribute("align", "center");
      vbox.setAttribute("flex", "1");
      vbox.setAttribute("observes", observes);

      let image = doc.createElement("image");
      image.className = "fxaSyncIllustration";
      image.setAttribute("src", "chrome://browser/skin/fxa/sync-illustration.svg");
      vbox.appendChild(image);

      let title = doc.createElement("label");
      title.className = "PanelUI-MOA-mobileBookmarks-instruction-title";
      title.textContent = this._("cp.moaMobileBookmarks.notsignedin.title");
      vbox.appendChild(title);

      let label = doc.createElement("label");
      label.className = "PanelUI-MOA-mobileBookmarks-instruction-label";
      label.textContent = this._("cp.moaMobileBookmarks.generic.label");
      vbox.appendChild(label);

      let button = doc.createElement("toolbarbutton");
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
    let menupopup = doc.createElement("menupopup");
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

    let winUtils = this.getWinUtils(win);
    winUtils.removeSheet(this.styleSheet, winUtils.AUTHOR_SHEET);

    let panelview = doc.getElementById(this.viewId);
    panelview.remove();

    let menupopup = doc.getElementById(this.bookmarksPopupId);
    menupopup.remove();
  },
  async onViewShowing(evt) {
    var subView = evt.target;
    var win = subView.ownerGlobal;

    var deck = subView.querySelector("#PanelUI-MOA-mobileBookmarks-deck");
    if (this.isConfiguredToSyncBookmarks) {
      let firstMobileItem = await PlacesUtils.bookmarks.fetch({
        parentGuid: PlacesUtils.bookmarks.mobileGuid,
        index: 0
      });
      if (!firstMobileItem) {
        deck.setAttribute("selectedIndex", this.deckIndices.DECK_INDEX_NOCLIENTS);
        if (win.document.getElementById("sync-syncnow-state").hidden) {
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
    "DECK_INDEX_NOCLIENTS": 1
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
  get strings() {
    let spec = "chrome://cmimprove/locale/browser.properties";
    delete this.strings;
    return this.strings = Services.strings.createBundle(spec);
  },
  get styleSheet() {
    let spec = "chrome://cmimprove/skin/mobile_bookmarks.css";
    delete this.styleSheet;
    return this.styleSheet = Services.io.newURI(spec);
  },
  getWinUtils(win) {
    return win.QueryInterface(Ci.nsIInterfaceRequestor).
      getInterface(Ci.nsIDOMWindowUtils);
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
    new win.PlacesMenu(evt, ("place:folder=" + PlacesUtils.mobileFolderId));
  },
  _(strKey) {
    return this.strings.GetStringFromName(strKey);
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
  }
};

this.readOnlyPrefsJs = {
  init() {
    if (OS.Constants.Sys.Name !== "WINNT") {
      return;
    }

    OS.File.stat(OS.Path.join(OS.Constants.Path.profileDir, "prefs.js")).
      then(info => {
        if (!info.winAttributes) {
          return;
        }
        CETracking.track("prefsjs-stat");
        if (!info.winAttributes.readOnly) {
          return;
        }

        CETracking.track("prefsjs-readonly");
        OS.File.setPermissions(info.path, {
          winAttributes: {
            readOnly: false
          }
        }).then(() => {
          CETracking.track("prefsjs-readonly-cleared");
        }, () => {
          CETracking.track("prefsjs-readonly-clearfail");
        });
      });
  }
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
    "firefox.kis": "kingsoft"
  },
  get prefs() {
    delete this.prefs;
    return this.prefs = Services.prefs.getDefaultBranch("app.");
  },
  prefSource: "chinaedition.channel",
  prefTarget: "distributor.channel",

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  _maybeOverrideDistributorChannel(prefKey) {
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
    Services.obs.addObserver(this, this.distributionTopic);
    this.prefs.addObserver("", this, true);
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
          this._maybeOverrideDistributorChannel(data);
        }
        break;
      default:
        break;
    }
  }
};

this.onboardingTourHack = {
  get prefs() {
    let branch = "browser.onboarding.";
    delete this.prefs;
    return this.prefs = Services.prefs.getDefaultBranch(branch);
  },

  init() {
    this.defaultPrefTweak();
  },

  defaultPrefTweak() {
    for (let tourType of ["newtour", "updatetour"]) {
      let tourParts = this.prefs.getCharPref(tourType, "").split(",");
      tourParts = tourParts.filter(tourPart => tourPart !== "screenshots");
      this.prefs.setCharPref(tourType, tourParts.join(","));
    }
  }
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
  }
};

this.amoDiscoPaneHack = {
  get prefs() {
    let branch = "extensions.webservice.";
    delete this.prefs;
    return this.prefs = Services.prefs.getDefaultBranch(branch);
  },

  init() {
    this.defaultPrefTweak();
  },

  defaultPrefTweak() {
    try {
      let url = new URL(this.prefs.getCharPref("discoverURL"));
      if (!url.searchParams.has("edition")) {
        url.searchParams.append("edition", "china");
      }
      this.prefs.setCharPref("discoverURL", url.href);
    } catch (ex) {
      Cu.reportError(ex);
    }
  }
};

this.mozCNGuard = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),

  // nsIObserver
  observe: function MCG_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "sessionstore-state-finalized":
      case "sessionstore-windows-restored":
        this.maybeOpenStartPages(aTopic);
        break;
      case "prefservice:after-app-defaults":
        mozCNSafeBrowsing.defaultPrefTweak();
        distributorChannelHack.defaultPrefTweak();
        onboardingTourHack.defaultPrefTweak();
        trackingProtectionHack.defaultPrefTweak();
        amoDiscoPaneHack.defaultPrefTweak();
        break;
    }
  },

  factories: new Map(),

  get browserHandler() {
    delete this.browserHandler;
    return this.browserHandler = Cc["@mozilla.org/browser/clh;1"].
      getService(Ci.nsIBrowserHandler);
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

      let exceptions = defBranch.getCharPref("extensions.legacy.exceptions", "");
      exceptions = new Set(exceptions.split(","));
      ["cehomepage", "cpmanager", "tabtweak"].forEach(prefix => {
        exceptions.add(`${prefix}@mozillaonline.com`);
      });
      exceptions = Array.from(exceptions).join(",");
      defBranch.setCharPref("extensions.legacy.exceptions", exceptions);
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

  uninitWindowListener(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }

    CustomizableUI.removeListener(this);

    for (let win of CustomizableUI.windows) {
      this.onWindowClosed(win);
    }
  },

  onWindowOpened(win) {
    bookmarkingUIHack.patchBrowserWindow(win);

    TrackingNotificationInfoBar.init(win);
    URL2QR.init(win);
  },

  onWindowClosed(win) {
    bookmarkingUIHack.unpatchBrowserWindow(win);

    TrackingNotificationInfoBar.uninit(win);
    URL2QR.uninit(win);
  },

  initFactories(isAppStartup) {
    Cm.QueryInterface(Ci.nsIComponentRegistrar);

    let constructors = [ceTracking, ceTrackingOld];
    if (ShellSvcStartup.shouldApply) {
      constructors.push(ShellSvcProxy);
    }

    constructors.forEach(targetConstructor => {
      let proto = targetConstructor.prototype;
      let factory = XPCOMUtils._getFactory(targetConstructor);
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

    ShellSvcStartup.init(isAppStartup);
  },

  uninitFactories(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }

    ShellSvcStartup.uninit();

    for (let [classID, factory] of this.factories) {
      Cm.unregisterFactory(classID, factory);
    }
    this.factories = new Map();
  },

  init(isAppStartup) {
    if (isAppStartup) {
      Services.obs.addObserver(this, "sessionstore-state-finalized");
    }
    Services.obs.addObserver(this, "prefservice:after-app-defaults");

    this.initDefaultPrefs();
    this.initFactories(isAppStartup);
    this.initWindowListener();

    mozCNSafeBrowsing.init();
    userJSDetection.detect();
    userJSDetection.removeHomepage();
    pocketButtonRemoval.init();
    screenshotButtonRemoval.init();
    dragAndDrop.init();
    mobileBookmarksHack.init();
    readOnlyPrefsJs.init();
    onboardingTourHack.init();
    trackingProtectionHack.init();
    amoDiscoPaneHack.init();

    ceClearHistory.init();
    CETracking.init();
    CETrackingLegacy.init();
    FxaSwitcher.init();
  },

  uninit(isAppShutdown) {
    Services.obs.removeObserver(this, "prefservice:after-app-defaults");

    this.uninitFactories(isAppShutdown);
    this.uninitWindowListener(isAppShutdown);

    // mozCNSafeBrowsing.uninit(isAppShutdown);
    dragAndDrop.uninit();
    mobileBookmarksHack.uninit();

    ceClearHistory.uninit(isAppShutdown);
    CETracking.uninit(isAppShutdown);
    CETrackingLegacy.uninit();
    FxaSwitcher.uninit();
  },

  isCEHome: function MCG_isCEHome(aSpec) {
    return [
      /^about:cehome$/,
      /^https?:\/\/[a-z]+\.firefoxchina\.cn\/?$/
    ].some((aExpectedSpec) => {
      return aExpectedSpec.test(aSpec);
    });
  },

  maybeOpenStartPages: function MCG_maybeOpenStartPages(aTopic) {
    Services.obs.removeObserver(this, aTopic);

    let sessionStartup = Cc["@mozilla.org/browser/sessionstartup;1"].
      getService(Ci.nsISessionStartup);
    if (aTopic == "sessionstore-state-finalized" &&
        sessionStartup.sessionType != sessionStartup.NO_SESSION) {
      Services.obs.addObserver(this, "sessionstore-windows-restored");
      return;
    }

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

      this.browserHandler.startPage.split("|").forEach((aPage, aIndex) => {
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
          title = info && info.title
        }).then(() => {
          let tab = w.gBrowser.addTab();
          w.gBrowser.moveTabTo(tab, aIndex);
          w.SessionStore.setTabState(tab, JSON.stringify({
            entries: [{
              url: aPage,
              title,
              triggeringPrincipal_base64: Utils.SERIALIZED_SYSTEMPRINCIPAL
            }]
          }));
        });
      });
    }
  }
};

function handleMessage(message, sender, sendResponse) {
  if (message.dir !== "bg2legacy") {
    return;
  }

  switch (message.type) {
    case "initOptions":
      let initOptions = {};
      for (let option of ["gesture", "url2qr"]) {
        let prefKey = `extensions.cmimprove.${option}.enabled`;
        initOptions[option] = Services.prefs.getBoolPref(prefKey, true);
      }
      sendResponse(initOptions);
      break;
    case "trackingEnabled":
      sendResponse({
        "trackingEnabled": CETracking.ude
      });
      break;
    case "updateOptions":
      for (let option in message.detail) {
        let prefKey = `extensions.cmimprove.${option}.enabled`;
        Services.prefs.setBoolPref(prefKey, message.detail[option]);
      }
      break;
    default:
      break;
  }
}

function install() {}
async function startup({ webExtension }, reason) {
  mozCNGuard.init(reason === APP_STARTUP);

  let { browser } = await webExtension.startup();
  browser.runtime.onMessage.addListener(handleMessage);
}
function shutdown(data, reason) {
  mozCNGuard.uninit(reason === APP_SHUTDOWN);
}
function uninstall() {}
