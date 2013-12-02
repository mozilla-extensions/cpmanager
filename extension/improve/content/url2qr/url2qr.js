(function() {
  let ns = MOA.ns("URL2QR");
  XPCOMUtils.defineLazyGetter(ns, "popup", function() {
    return document.getElementById("mo-url2qr-popup");
  });
  XPCOMUtils.defineLazyGetter(ns, "popupAnchor", function() {
    return document.getElementById("mo-url2qr-icon");
  });
  XPCOMUtils.defineLazyGetter(ns, "popupImage", function() {
    return document.getElementById("mo-url2qr-image");
  });
  XPCOMUtils.defineLazyGetter(ns, "popupFx4A", function() {
    return document.getElementById("mo-url2qr-fx4a");
  });

  let PREF_KEY = "extensions.cmimprove.url2qr.enabled";

  let listener = {
    QueryInterface: function(iid) {
      if (iid.equals(Ci.nsISupports) ||
        iid.equals(Ci.nsISupportWeakReference) ||
        iid.euqals(Ci.nsIWebProgressListener)) {
        return this;
      }

      throw Cr.NS_ERROR_NO_INTERFACE;
    },

    onStateChange:    function() {},
    onProgressChange: function() {},
    onStatusChange:   function() {},
    onSecurityChange: function() {},
    onLocationChange: function(aWebProgress, aRequest, aUri) {
      let isTopLevel = aWebProgress.isTopLevel ||
                       aWebProgress.DOMWindow == aWebProgress.DOMWindow.top;

      if (!ns.enabled || !isTopLevel) {
        return;
      }

      ns.popupAnchor.hidden = !(aUri.spec == "about:cehome" ||
                                aUri.scheme == "http" ||
                                aUri.scheme == "https" ||
                                aUri.scheme == "ftp");
    }
  };

  ns.enabled = Services.prefs.getBoolPref(PREF_KEY);

  ns.observe = function(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "nsPref:changed":
        if (aData == PREF_KEY) {
          ns.enabled = Services.prefs.getBoolPref(aData);
        }
        break;
    }
  };

  ns.popupShown = function() {
    let uri = gBrowser.selectedBrowser.currentURI;
    if (!uri) {
      ns.popup.hidePopup();
    }

    let text = uri.asciiSpec;
    text = {
      "about:cehome": "http://i.firefoxchina.cn/?from=url2qr"
    }[text] || text;
    let datauri = MOA.URL2QR.QRCode.generatePNG(text);
    ns.popupImage.src = datauri;
    ce_tracking.track("url2qr-qrshown");
  };

  window.addEventListener("load", function() {
    window.setTimeout(function() {
      gBrowser.addProgressListener(listener);
      Services.prefs.addObserver("extensions.cmimprove.url2qr.", ns, false);
    }, 1000);
  }, false);
  window.addEventListener("unload", function() {
    gBrowser.removeProgressListener(listener);
    Services.prefs.removeObserver("extensions.cmimprove.url2qr.", ns);
  }, false);
})();
