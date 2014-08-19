/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let Cu = Components.utils;
let Cr = Components.results;
let Ci = Components.interfaces;
let Cc = Components.classes;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "setTimeout",
  "resource://gre/modules/Timer.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "SafeBrowsing",
  "resource://gre/modules/SafeBrowsing.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "SkipSBData",
  "resource://cmsafeflag/SkipSBData.jsm");

XPCOMUtils.defineLazyGetter(this, "CETracking", function() {
  return Cc["@mozilla.com.cn/tracking;1"].getService().wrappedJSObject;
});

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
        break;
      case "browser-delayed-startup-finished":
        this.initProgressListener(aSubject);
        break;
      case "sessionstore-state-finalized":
      case "sessionstore-windows-restored":
        this.trackRogueStartup(aTopic);
        break;
      case "http-on-modify-request":
        let channel = aSubject;
        channel.QueryInterface(Ci.nsIHttpChannel);
        let uri = channel.originalURI;

        if (uri.asciiSpec == SafeBrowsing.gethashURL) {
          this.cancelGetHashOnTimeout(channel);
        } else {
          this.skipFalsePositiveSB(channel, uri);
        }
      case "http-on-examine-response":
      case "http-on-examine-cached-response":
      case "http-on-examine-merged-response":
        this.dropRogueRedirect(aSubject);
        break;
    }
  },

  trackRogueStartup: function MCG_trackRoughStartup(aTopic) {
    Services.obs.removeObserver(this, aTopic);

    let sessionStartup = Cc["@mozilla.org/browser/sessionstartup;1"].
      getService(Ci.nsISessionStartup);
    if (aTopic == "sessionstore-state-finalized" &&
        sessionStartup.sessionType != sessionStartup.NO_SESSION) {
      Services.obs.addObserver(this, "sessionstore-windows-restored", false);
      return;
    }

    let w = Services.wm.getMostRecentWindow("navigator:browser");

    let choice = "badpref";
    try {
      choice = Services.prefs.getIntPref("browser.startup.page");
    } catch(e) {};

    // restore on startup/restart
    let doRestore = sessionStartup.doRestore();

    // urls to open when there's no url in arguments
    let defaultArgs = Cc["@mozilla.org/browser/clh;1"].
      getService(Ci.nsIBrowserHandler).defaultArgs;
    let defaultArgZero = defaultArgs.split("|")[0];

    // will open cehome in foreground if no arguments
    let prefSet = !doRestore && [
      /^about:cehome$/,
      /^http:\/\/i\.firefoxchina\.cn\/?$/
    ].some((aSpec) => {
      return aSpec.test(defaultArgZero);
    });

    // no extra arguments
    let noArgs = w.arguments && w.arguments[0] &&
      w.arguments[0] == defaultArgs;

    let reportFirstLocation = function(aURI) {
      let expected = aURI.asciiSpec == defaultArgZero;
      // normalize defaultArgZero, e.g. add trailing slash.
      try {
        let defaultArgZeroURI = Services.io.newURI(defaultArgZero, null, null);
        expected = aURI.equals(defaultArgZeroURI);
      } catch(e) {};

      if (prefSet && noArgs) {
        expected = expected || aURI.asciiSpec;
      }

      let urlTemplate = "http://addons.g-fox.cn/firstLocation.gif?" +
                        "p=%PREF_SET%&a=%NO_ARGS%&e=%EXPECTED%" +
                        "&bsp=%BSP_CHOICE%&r=%RANDOM%";
      let url = urlTemplate.
        replace("%PREF_SET%", prefSet).
        replace("%NO_ARGS%", noArgs).
        replace("%EXPECTED%", encodeURIComponent(expected)).
        replace("%BSP_CHOICE%", choice).
        replace("%RANDOM%", Math.random());
      CETracking.send(url);
    };

    let progressListener = {
      onLocationChange: function(aWebProgress, b, aLocation, d) {
        if (aWebProgress.isTopLevel && (aLocation instanceof Ci.nsIURI)) {
          w.gBrowser.removeProgressListener(progressListener);

          reportFirstLocation(aLocation);
        }
      }
    };

    /**
     * BUSY_FLAGS_BEFORE_PAGE_LOAD seems to work, but not really sure.
     * could use a better check here.
     */
    let docShell = w.gBrowser.selectedBrowser.docShell;
    if (docShell.busyFlags & Ci.nsIDocShell.BUSY_FLAGS_BEFORE_PAGE_LOAD) {
      /**
       * addProgressListener: listener for the selectedBrowser
       * addTabsProgressListener: listener for every browser in gBrowser
       */
      w.gBrowser.addProgressListener(progressListener);
    } else {
      reportFirstLocation(w.gBrowser.selectedBrowser.currentURI);
    }
  },

  initProgressListener: function MCG_initProgressListener(aSubject) {
    let w = aSubject;
    w.gBrowser.addTabsProgressListener({
      onLocationChange: function(a, b, aRequest, aLocation, aFlags) {
        if (aFlags & Ci.nsIWebProgressListener.LOCATION_CHANGE_ERROR_PAGE) {
          let baseDomain = Services.eTLD.getBaseDomain(aLocation, 0);
          if (baseDomain == "taobao.com" &&
              aReuqest.status == Cr.NS_ERROR_NET_RESET) {
            let urlTemplate = "http://addons.g-fox.cn/taobaoReset.gif?" +
                              "r=%RANDOM%&spec=%SPEC%";
            let url = urlTemplate.
              replace("%SPEC%", encodeURIComponent(aLocation.asciiSpec)).
              replace("%RANDOM%", Math.random());
            CETracking.send(url);
          }
        }
      }
    });
  },

  cancelGetHashOnTimeout: function MCG_cancelGetHashOnTimeout(aChannel) {
    setTimeout(function() {
      if (aChannel && aChannel.isPending()) {
        aChannel.cancel(Cr.NS_ERROR_ABORT);
        CETracking.track("sb-gethash-abort");
      }
    }, 10e3);
    CETracking.track("sb-gethash-found");
  },

  _skipSBData: null,

  skipFalsePositiveSB: function MCG_skipFalsePositiveSB(aChannel, aURI) {
    if (!(aChannel.loadFlags & Ci.nsIChannel.LOAD_CLASSIFY_URI)) {
      return;
    }

    if (!this._skipSBData) {
      this._skipSBData = SkipSBData.read();
    }

    if ((this._skipSBData.urls &&
         this._skipSBData.urls[aURI.asciiSpec]) ||
        (this._skipSBData.baseDomains &&
         this._skipSBData.baseDomains[Services.eTLD.getBaseDomain(aURI)])) {
      aChannel.loadFlags &= ~Ci.nsIChannel.LOAD_CLASSIFY_URI;
      CETracking.track("sb-skip-classify");
    } else {
      CETracking.track("sb-will-classify");
    }
  },

  dropRogueRedirect: function MCG_dropRogueRedirect(aSubject) {
    let channel = aSubject;
    channel.QueryInterface(Ci.nsIHttpChannel);

    if (!(channel.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI)) {
      return;
    }

    let restrictedHosts = {
      "huohu123.com": "h.17huohu.com",
      "i.firefoxchina.cn": "i.17huohu.com",
      "i.g-fox.cn": "g.17huohu.com",
      "www.huohu123.com": "h.17huohu.com",
      "i.17huohu.com": "",
      "g.17huohu.com": "",
      "h.17huohu.com": ""
    };

    if (Object.keys(restrictedHosts).indexOf(channel.originalURI.host) > -1) {
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
