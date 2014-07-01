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
        Services.obs.addObserver(this, "http-on-modify-request", false);
        Services.obs.addObserver(this, "http-on-examine-response", false);
        Services.obs.addObserver(this, "http-on-examine-cached-response", false);
        Services.obs.addObserver(this, "http-on-examine-merged-response", false);
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
      if ([301, 302].indexOf(channel.responseStatus || 0) > -1) {
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

          let tracker = Cc["@mozilla.com.cn/tracking;1"];
          if (tracker && tracker.getService().wrappedJSObject) {
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

            tracker.getService().wrappedJSObject.send(url);
          }
        }
      }
    }
  }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([mozCNGuard]);
