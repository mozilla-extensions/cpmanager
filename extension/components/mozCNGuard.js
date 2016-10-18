/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var Cu = Components.utils;
var Cr = Components.results;
var Ci = Components.interfaces;
var Cc = Components.classes;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "ShortcutUtils",
  "resource://gre/modules/ShortcutUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "setTimeout",
  "resource://gre/modules/Timer.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "SafeBrowsing",
  "resource://gre/modules/SafeBrowsing.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "SkipSBData",
  "resource://cmsafeflag/SkipSBData.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PlacesUtils",
  "resource://gre/modules/PlacesUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "OS",
  "resource://gre/modules/osfile.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "mozCNSafeBrowsing",
  "resource://cmsafeflag/CNSafeBrowsingRegister.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "CustomizableUI",
  "resource:///modules/CustomizableUI.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "AddonManager",
  "resource://gre/modules/AddonManager.jsm");


XPCOMUtils.defineLazyGetter(this, "CEHomepage", function() {
  try {
    let tmp = {};
    Cu.import("resource://ntab/mozCNUtils.jsm", tmp);
    if (tmp.Homepage && tmp.Homepage.aboutpage) {
      return tmp.Homepage;
    }
  } catch(ex) {};

  return {
    aboutpage: "http://i.firefoxchina.cn/"
  }
});
XPCOMUtils.defineLazyGetter(this, "CETracking", function() {
  return Cc["@mozilla.com.cn/tracking;1"].getService().wrappedJSObject;
});
XPCOMUtils.defineLazyGetter(this, "SyncedTabsDeckComponent", function() {
  try {
    let tmp = {};
    Cu.import("resource:///modules/syncedtabs/SyncedTabsDeckComponent.js", tmp);
    return tmp.SyncedTabsDeckComponent;
  } catch(ex) {
    return {};
  };
});

XPCOMUtils.defineLazyGetter(this, "gMM", function() {
  return Cc["@mozilla.org/globalmessagemanager;1"].
    getService(Ci.nsIMessageListenerManager);
});

var safeBrowsingHack = {
  _shouldCancel: {
    "apprep": false
  },
  _skipSBData: null,

  get appRepURL() {
    let appRepURL = "";
    try {
      appRepURL = this.prefs["apprep"].getCharPref("appRepURL");
    } catch(e) {};
    delete this.appRepURL;
    return this.appRepURL = appRepURL;
  },

  get prefs() {
    delete this.prefs;
    return this.prefs = {
      "apprep": Services.prefs.getDefaultBranch("browser.safebrowsing.")
    };
  },

  init: function() {
    // introduced in https://bugzil.la/1165816 , Fx 41
    if (this.prefs["apprep"].getPrefType("downloads.remote.timeout_ms") ==
        Services.prefs.PREF_INVALID) {
      this._shouldCancel["apprep"] = true;
    }
  },

  onHttpRequest: function(aSubject) {
    let channel = aSubject;
    channel.QueryInterface(Ci.nsIHttpChannel);
    let uri = channel.originalURI;

    switch (uri.asciiSpec) {
      case SafeBrowsing.gethashURL:
        CETracking.track("sb-gethash-google");
        break;
      case this.appRepURL:
        this.maybeCancelOnTimeout(channel, "apprep");
        break;
      default:
        this.skipFalsePositiveSB(channel, uri);
        break;
    }
  },

  maybeCancelOnTimeout: function (aChannel, aType) {
    if (!this._shouldCancel[aType]) {
      return;
    }

    setTimeout(function() {
      if (aChannel && aChannel.isPending()) {
        aChannel.cancel(Cr.NS_ERROR_ABORT);
        CETracking.track("sb-" + aType + "-abort");
      }
    }, 10e3);
    CETracking.track("sb-" + aType + "-found");
  },

  skipFalsePositiveSB: function (aChannel, aURI) {
    if (!(aChannel.loadFlags & Ci.nsIChannel.LOAD_CLASSIFY_URI)) {
      return;
    }

    if (!this._skipSBData) {
      this._skipSBData = SkipSBData.read();
    }

    try {
      let baseDomain = Services.eTLD.getBaseDomain(aURI);
      if ((this._skipSBData.urls &&
           this._skipSBData.urls[aURI.asciiSpec]) ||
          (this._skipSBData.baseDomains &&
           this._skipSBData.baseDomains[baseDomain])) {
        aChannel.loadFlags &= ~Ci.nsIChannel.LOAD_CLASSIFY_URI;
        CETracking.track("sb-skip-classify");
      } else {
        CETracking.track("sb-will-classify");
      }
    } catch(e) {
      switch (e.name) {
        case "NS_ERROR_HOST_IS_IP_ADDRESS":
        case "NS_ERROR_INSUFFICIENT_DOMAIN_LEVELS":
          Services.console.logStringMessage(e.name + ": " + aURI.spec);
          break;
        default:
          Cu.reportError(e);
          break;
      }
    }
  }
}

var userJSDetection = {
  get sandbox() {
    let nullprincipal = Cc["@mozilla.org/nullprincipal;1"].
      createInstance(Ci.nsIPrincipal);

    let sandbox = Cu.Sandbox(nullprincipal);
    sandbox.user_pref = this.userPref.bind(this);

    delete this.sandbox;
    return this.sandbox = sandbox;
  },

  detect: function() {
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
  },

  isCEHome: function(aURL) {
    let spec = aURL;
    try {
      spec = Services.io.newURI(spec, null, null).asciiSpec;
    } catch(e) {
      try {
        spec = Services.uriFixup.getFixupURIInfo(spec,
          Ci.nsIURIFixup.FIXUP_FLAG_NONE).preferredURI.asciiSpec;
      } catch(e) {};
    }

    return [
      /^about:cehome$/,
      /^http:\/\/[ein]\.firefoxchina\.cn\/?$/
    ].some((aExpectedSpec) => {
      return aExpectedSpec.test(spec);
    });
  },

  userPref: function(key, val) {
    switch (key) {
      case "browser.startup.homepage":
        CETracking.track("userjs-homepage-exists");

        if (val.split("|").some(this.isCEHome)) {
          break;
        };

        CETracking.track("userjs-homepage-other");
        break;
      default:
        break;
    }
  },

  removeHomepage: function() {
    let path = OS.Path.join(OS.Constants.Path.profileDir, "user.js");
    OS.File.exists(path).then(function(aExists) {
      if (!aExists) return;
      OS.File.stat(path).then(function(aInfo) {
        if (!aInfo.size) return;
        // From fx30 on encoding can be inlined as a parameter for OS.File.read
        OS.File.read(path).then(function(aArray) {
          let text = new TextDecoder().decode(aArray);
          let content = text.replace(/^\s*user_pref\s*\(\s*("|')browser\.startup\.homepage\1.+\)\s*;\s*$/mg, "");
          OS.File.writeAtomic(path, content, {
            encoding: "utf-8"
          });
        });
      });
    });
  }
};

var buttonRemoval = {
  id: "dummy-button-id",
  prefKey: "dummy-pref-key",
  earlyReturn: function() {
    return false;
  },

  init: function() {
    if (this.earlyReturn()) {
      return;
    }

    let removed = false;
    try {
      removed = Services.prefs.getBoolPref(this.prefKey);
    } catch(e) {};
    if (removed) {
      return;
    }

    CustomizableUI.addListener(this);
  },
  onAreaNodeRegistered: function(aArea) {
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

var loopButtonRemoval = Object.create(buttonRemoval, {
  id: {
    value: "loop-button"
  },
  prefKey: {
    value: "extensions.cpmanager@mozillaonline.com.loopButtonRemoved"
  },
  earlyReturn: {
    value: function() {
      return Services.vc.compare(Services.appinfo.version, "36.0") < 0 ||
             Services.prefs.getPrefType("loop.hawk-session-token") ||
             Services.prefs.getPrefType("loop.hawk-session-token.fxa");
    }
  }
});

var pocketButtonRemoval = Object.create(buttonRemoval, {
  id: {
    value: "pocket-button"
  },
  prefKey: {
    value: "extensions.cpmanager@mozillaonline.com.pocketButtonRemoved"
  },
  earlyReturn: {
    value: function() {
      return Services.vc.compare(Services.appinfo.version, "38.0.5") < 0 ||
             Services.prefs.getChildList("browser.pocket.settings.").length ||
             Services.prefs.getChildList("extensions.pocket.settings.").length;
    }
  }
});

var socialShareRemoval = Object.create(buttonRemoval, {
  id: {
    value: "social-share-button"
  },
  prefKey: {
    value: "extensions.cpmanager@mozillaonline.com.socialShareRemoved"
  },
  earlyReturn: {
    value: function() {
      return Services.vc.compare(Services.appinfo.version, "35.0") < 0;
    }
  }
});

var mobilePromoLinksHack = {
  init: function() {
    if (Services.vc.compare(Services.appinfo.version, "48.0") >= 0) {
      return;
    }

    CustomizableUI.addListener(this);

    if (!SyncedTabsDeckComponent.prototype) {
      return;
    }

    SyncedTabsDeckComponent.prototype.openAndroidLink = function(event) {
      this._openUrl("http://www.firefox.com.cn/#android", event);
    };
    SyncedTabsDeckComponent.prototype.openiOSLink = function(event) {
      this._openUrl("http://www.firefox.com.cn/#ios", event);
    };
  },
  onWidgetBeforeDOMChange: function(node, nextNode, container, isRemoval) {
    if (isRemoval || node.id !== "sync-button" || !container) {
      return;
    }

    let doc = container.ownerDocument,
        selector = "#PanelUI-remotetabs-mobile-promo > .remotetabs-promo-link";
    [].forEach.call(doc.querySelectorAll(selector), function(label) {
      let os;
      if (label.hasAttribute("mobile-promo-os")) {
        os = label.getAttribute("mobile-promo-os");
      } else if (label.hasAttribute("href")) {
        let regex = /^https:\/\/www\.mozilla\.org\/firefox\/(android|ios)\//;
        let result = regex.exec(label.getAttribute("href"));
        if (!result) {
          return;
        }

        os = result[1];
        label.removeAttribute("href");
      }

      // similar to https://bugzil.la/1237945
      label.addEventListener("click", function(evt) {
        if (evt.button > 1) {
          return;
        }
        evt.stopPropagation();

        let link = "http://www.firefox.com.cn/#" + os;
        doc.defaultView.openUILinkIn(link, "tab");
        CustomizableUI.hidePanelForNode(evt.target);
      }, true);
    });
  }
};

var defaultFontHack = {
  get prefs() {
    delete this.prefs;
    return this.prefs = Services.prefs.getDefaultBranch("font.");
  },

  init: function() {
    this.defaultPrefTweak();
  },

  defaultPrefTweak: function() {
    switch (Services.appinfo.OS) {
      case "WINNT":
        let key = "name-list.sans-serif.zh-CN",
            val = "Microsoft YaHei, MS Song, SimSun, SimSun-ExtB";
        this.prefs.setCharPref(key, val);
        break;
      default:
        break;
    }
  }
}

var dragAndDrop = {
  _appcenterEnabled: false,
  _frameScript: "chrome://cmimprove/content/gesture/dragdrop.js",
  _inited: false,
  _listening: false,
  _messageName: "cpmanager@mozillaonline.com:dragAndDrop",
  _prefKey: "extensions.cmimprove.gesture.enabled",

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),

  get enabled() {
    let enabled = false;
    try {
      enabled = Services.prefs.getBoolPref(this._prefKey);
    } catch(e) {};
    return !this._appcenterEnabled && enabled;
  },

  initOnce: function() {
    if (this._inited) {
      return;
    }
    this._inited = true;

    let self = this;
    AddonManager.getAddonByID("livemargins@mozillaonline.com", function(addon) {
      if (addon && !addon.userDisabled && !addon.appDisabled &&
          Services.vc.compare(addon.version, "5.2") < 0) {
        self._appcenterEnabled = true;
      }

      gMM.loadFrameScript(self._frameScript, true);
      self.toggleListener();
      self.watchPrefs();
    });
  },

  observe: function(subject, topic, data) {
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

  openLink: function(browser, link) {
    browser.ownerGlobal.gBrowser.loadOneTab(link, {
      inBackground: true,
      allowThirdPartyFixup: false,
      relatedToCurrent: true
    });
  },

  receiveMessage: function(msg) {
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
        } catch(ex) {
          browser.ownerGlobal.console.log(browser);
        }
        break;
    }
  },

  searchText: function(browser, text) {
    var engine = Services.search.currentEngine;
    if (!engine) {
      return;
    }

    var link = engine.getSubmission(text, null).uri.spec;
    this.openLink(browser, link);
  },

  toggleListener: function() {
    let enabled = this.enabled;
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

  watchPrefs: function() {
    Services.prefs.addObserver(this._prefKey, this, true);
  }
}

var bookmarkHack = {
  _itemId: -1,
  _prefKey: "extensions.cmimprove.bookmarks.add.defaultFolder",
  get recentFolder() {
    let id = PlacesUtils.unfiledBookmarksFolderId;
    try {
      id = Services.prefs.getIntPref(this._prefKey);
    } catch(ex) {};
    return id;
  },
  set recentFolder(folderId) {
    Services.prefs.setIntPref(this._prefKey, folderId);
  },
  get strings() {
    let spec = "chrome://cmimprove/locale/browser.properties";
    delete this.strings;
    return this.strings = Services.strings.createBundle(spec);
  },
  handleEvent: function(evt) {
    win = evt.target.ownerGlobal;
    if (evt.originalTarget !== win.StarUI.panel) {
      return;
    }
    switch (evt.type) {
      case "popupshown":
        if (win.StarUI._isNewBookmark === false) { // undefined before Fx 47
          break;
        }
        this._itemId = win.StarUI._itemId;
        this._recentFolderForUndo = this.recentFolder;
        break;
      case "popuphidden":
        this._itemId = -1;
        if (((win.StarUI._isNewBookmark &&
              win.StarUI._uriForRemoval) || // Fx 47+
             win.StarUI._actionOnHide) && // before Fx 47
            !isNaN(this._recentFolderForUndo)) {
          this.recentFolder = this._recentFolderForUndo;
        }
        delete this._recentFolderForUndo;
        break;
    }
  },

  init: function() {
    PlacesUtils.bookmarks.addObserver(this, false);
  },

  onBeforeItemRemoved: function() {},
  onBeginUpdateBatch: function() {},
  onEndUpdateBatch: function() {},
  onItemAdded: function() {},
  onItemChanged: function() {},
  onItemMoved: function(itemId, b, c, newParentId, e, f, g, h, i) {
    if (itemId !== this._itemId) {
      return;
    }
    this.recentFolder = newParentId;
  },
  onItemRemoved: function() {},
  onItemVisited: function() {},

  patchBrowserWindow: function(win) {
    win.MOA = win.MOA || {};
    win.MOA.Improve = win.MOA.Improve || {};
    win.MOA.Improve.Bookmark = win.MOA.Improve.Bookmark || {
      getParentFolder: this._getParentFolder.bind(this),
      getString: this._getString.bind(this)
    };

    let bmb_vbt = win.document.getElementById("BMB_viewBookmarksToolbar");
    if (bmb_vbt) {
      bmb_vbt.setAttribute("label", this._getString("menu.bookmarksToolbar"));
    }

    if (win.BookmarkingUI) {
      win.BookmarkingUI.__defineGetter__("_unstarredTooltip", function() {
        let g;
        try {
          g = win;
        } catch(e) {
          g = window;
        }

        let unstarredTooltip = g.MOA.Improve.Bookmark.
          getString("starButtonOff.tooltip");
        if (this.BOOKMARK_BUTTON_SHORTCUT) {
          let args = [];
          let shortcut = g.document.
            getElementById(this.BOOKMARK_BUTTON_SHORTCUT);
          if (shortcut) {
            args.push(ShortcutUtils.prettifyShortcut(shortcut));
            unstarredTooltip = g.MOA.Improve.Bookmark.
              getString("starButtonOff.tooltip2", args);
          }
        }

        delete this._unstarredTooltip;
        return this._unstarredTooltip = unstarredTooltip;
      });
    }

    if (win.PlacesCommandHook && win.PlacesCommandHook.bookmarkCurrentPage) {
      win.MOA.Improve.Bookmark.bookmarkCurrentPage =
        win.PlacesCommandHook.bookmarkCurrentPage;
      win.PlacesCommandHook.bookmarkCurrentPage = function(...args) {
        let g;
        try {
          g = win;
        } catch(e) {
          g = window;
        }

        // For Fx earlier than 47
        if (Components.stack.caller &&
            (Components.stack.caller.name === "BUI_onCommand")) {
          args[0] = true;
        }
        args[1] = args[1] || g.MOA.Improve.Bookmark.getParentFolder();
        g.MOA.Improve.Bookmark.bookmarkCurrentPage.
          apply(g.PlacesCommandHook, args);
      }
    }

    if (win.StarUI && win.StarUI.panel) {
      win.StarUI.panel.addEventListener("popupshown", this, false);
      win.StarUI.panel.addEventListener("popuphidden", this, false);
    }
  },
  _getParentFolder: function() {
    let id = -1;
    try {
      let prefKey = "extensions.cmimprove.bookmarks.parentFolder";
      id = Services.prefs.getIntPref(prefKey);
    } catch(ex) {};
    if (PlacesUtils.isRootItem(id)) {
      return id;
    }

    return this.recentFolder;
  },
  _getString: function(id, args) {
    if (args) {
      return this.strings.formatStringFromName(id, args, args.length);
    } else {
      return this.strings.GetStringFromName(id);
    }
  }
};

var webchannelObjectHack = {
  branchStr: "webchannel.allowObject.",
  extraURLs: [
    "https://accounts.firefox.com.cn"/*,
    "http://e.firefoxchina.cn",
    "http://i.firefoxchina.cn",
    "http://n.firefoxchina.cn"*/
  ],
  prefKey: "urlWhitelist",
  get prefs() {
    delete this.prefs;
    return this.prefs = Services.prefs.getDefaultBranch(this.branchStr);
  },

  init: function() {
    this.defaultPrefTweak();
  },

  defaultPrefTweak: function() {
    if (!this.prefs.getPrefType(this.prefKey)) {
      return;
    }
    let urls = this.prefs.getCharPref(this.prefKey).split(/\s+/);
    urls = this.extraURLs.concat(urls);
    this.prefs.setCharPref(this.prefKey, urls.join(" "));
  }
};

function mozCNGuard() {}

mozCNGuard.prototype = {
  classID: Components.ID("{06686705-c9e6-464d-b34f-3c4dc2d5b183}"),

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),

  // nsIObserver
  observe: function MCG_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "profile-after-change":
        Services.obs.addObserver(this, "browser-delayed-startup-finished", false);
        Services.obs.addObserver(this, "sessionstore-state-finalized", false);
        Services.obs.addObserver(this, "http-on-modify-request", false);
        Services.obs.addObserver(this, "http-on-examine-response", false);
        Services.obs.addObserver(this, "http-on-examine-cached-response", false);
        Services.obs.addObserver(this, "http-on-examine-merged-response", false);
        Services.obs.addObserver(this, "prefservice:after-app-defaults", false);
        safeBrowsingHack.init();
        mozCNSafeBrowsing.init();
        userJSDetection.detect();
        userJSDetection.removeHomepage();
        loopButtonRemoval.init();
        pocketButtonRemoval.init();
        socialShareRemoval.init();
        mobilePromoLinksHack.init();
        defaultFontHack.init();
        bookmarkHack.init();
        webchannelObjectHack.init();
        break;
      case "browser-delayed-startup-finished":
        this.initProgressListener(aSubject);
        bookmarkHack.patchBrowserWindow(aSubject);
        dragAndDrop.initOnce();
        break;
      case "sessionstore-state-finalized":
      case "sessionstore-windows-restored":
        this.maybeOpenStartPages(aTopic);
        break;
      case "http-on-modify-request":
        safeBrowsingHack.onHttpRequest(aSubject);
        mozCNSafeBrowsing.onHttpRequest(aSubject);
        break;
      case "http-on-examine-response":
        mozCNSafeBrowsing.onHttpResponse(aSubject);
        // intentionally no break
      case "http-on-examine-cached-response":
      case "http-on-examine-merged-response":
        this.dropRogueRedirect(aSubject);
        break;
      case "prefservice:after-app-defaults":
        mozCNSafeBrowsing.defaultPrefTweak();
        defaultFontHack.defaultPrefTweak();
        webchannelObjectHack.defaultPrefTweak();
        break;
    }
  },

  get browserHandler() {
    delete this.browserHandler;
    return this.browserHandler = Cc["@mozilla.org/browser/clh;1"].
      getService(Ci.nsIBrowserHandler);
  },

  get startPageChoice() {
    let choice = "badpref";
    try {
      choice = Services.prefs.getIntPref("browser.startup.page");
    } catch(e) {};

    delete this.startPageChoice;
    return this.startPageChoice = choice;
  },

  isCEHome: function MCG_isCEHome(aSpec) {
    return [
      /^about:cehome$/,
      /^http:\/\/[ein]\.firefoxchina\.cn\/?$/
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
      Services.obs.addObserver(this, "sessionstore-windows-restored", false);
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

    let self = this;
    if (argumentsZero instanceof Ci.nsISupportsArray) {
      let len = argumentsZero.Count(), externalURLs = [];
      for (let i = 0; i < len; i++) {
        let urisstring = argumentsZero.GetElementAt(i)
                                      .QueryInterface(Ci.nsISupportsString);
        let uri = Services.io.newURI(urisstring.data, null, null);
        externalURLs.push(uri.asciiSpec);
      }

      this.browserHandler.startPage.split("|").forEach(function(aPage, aIndex) {
        let uri = Services.io.newURI(aPage, null, null);
        let title;

        // Don't open if already in commandline argument.
        let page = {
          "about:cehome": CEHomepage.aboutpage
        }[uri.asciiSpec] || uri.asciiSpec;
        if (externalURLs.some(function(externalURL) {
          return externalURL.split("?")[0] == page.split("?")[0];
        })) {
          return;
        }

        if (self.isCEHome(aPage)) {
          aPage = uri.asciiSpec + "?from=extra_start";
          title = "\u706b\u72d0\u4e3b\u9875";
        }

        w.PlacesUtils.asyncHistory.getPlacesInfo(uri, {
          handleError: function() {},
          handleResult: function(aPlaceInfo) {
            title = aPlaceInfo.title;
          },
          handleCompletion: function() {
            let tab = w.gBrowser.addTab();
            w.gBrowser.moveTabTo(tab, aIndex);
            w.SessionStore.setTabState(tab, JSON.stringify({
              entries: [{ url: aPage, title: title }]
            }));
          }
        });
      });
    }
  },

  initProgressListener: function MCG_initProgressListener(aSubject) {
    let w = aSubject;
    w.gBrowser.addTabsProgressListener({
      // see /xpcom/base/ErrorList.h
      get NS_ERROR_PHISHING_URI() {
        return 1 * Math.pow(2, 31) + (0x45 + 24) * Math.pow(2, 16) + 31;
      },
      onLocationChange: function(a, b, aRequest, aLocation, aFlags) {
        if (aFlags & Ci.nsIWebProgressListener.LOCATION_CHANGE_ERROR_PAGE) {
          if (aRequest.status & this.NS_ERROR_PHISHING_URI) {
            CETracking.track("sb-blocked-phish");
          }
        }
      }
    });
  },

  dropRogueRedirect: function MCG_dropRogueRedirect(aSubject) {
    let channel = aSubject;
    channel.QueryInterface(Ci.nsIHttpChannel);

    if (!(channel.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI)) {
      return;
    }

    let host;
    try {
      host = channel.originalURI.host;
    } catch(ex) {
      return;
    }

    let restrictedHosts = {
      "huohu123.com": "h.17huohu.com",
      "e.firefoxchina.cn": "e.17huohu.com",
      "i.firefoxchina.cn": "i.17huohu.com",
      "n.firefoxchina.cn": "n.17huohu.com",
      "i.g-fox.cn": "g.17huohu.com",
      "www.huohu123.com": "h.17huohu.com",
      "e.17huohu.com": "",
      "i.17huohu.com": "",
      "g.17huohu.com": "",
      "h.17huohu.com": "",
      "n.17huohu.com": ""
    };

    if (Object.keys(restrictedHosts).indexOf(host) > -1) {
      let responseStatus = 0;
      try {
        responseStatus = channel.responseStatus;
      } catch(e) {};
      if ([301, 302].indexOf(responseStatus) > -1) {
        let redirectTo = channel.getResponseHeader("Location");
        redirectTo = Services.io.newURI(redirectTo, null, channel.originalURI);

        if (Object.keys(restrictedHosts).indexOf(redirectTo.host) == -1) {
          let newURI = channel.originalURI.clone();
          let newHost = restrictedHosts[newURI.host];
          if (newHost) {
            newURI.host = newHost;

            let webNavigation = channel.notificationCallbacks.
              getInterface(Ci.nsIWebNavigation);
            channel.cancel(Cr.NS_BINDING_ABORTED);
            webNavigation.loadURI(newURI.spec, null, null, null, null);
          }

          let uuid = "NA";
          let uuidKey = "extensions.cpmanager@mozillaonline.com.uuid";
          try {
            uuid = Services.prefs.getCharPref(uuidKey);
          } catch(e) {}

          let urlTemplate = "http://addons.g-fox.cn/302.gif?r=%RANDOM%" +
                            "&status=%STATUS%&from=%FROM%&to=%TO%&id=%ID%";
          let url = urlTemplate.
            replace("%STATUS%", channel.responseStatus).
            replace("%FROM%", encodeURIComponent(channel.originalURI.spec)).
            replace("%TO%", encodeURIComponent(redirectTo.spec)).
            replace("%ID%", encodeURIComponent(uuid)).
            replace("%RANDOM%", Math.random());
          CETracking.send(url);
        }
      }
    }
  }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([mozCNGuard]);
