this.EXPORTED_SYMBOLS = ["URL2QR"];

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyGetter(this, "require", function() {
  return Cu.import("resource://devtools/shared/Loader.jsm", {}).
    devtools.require;
});
XPCOMUtils.defineLazyGetter(this, "CETracking", function() {
  return Cc["@mozilla.com.cn/tracking;1"].getService().wrappedJSObject;
});

function Listener(win) {
  this.win = win;
}
Listener.prototype = {
  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsISupportWeakReference,
    Ci.nsIWebProgressListener
  ]),
  onStateChange() {},
  onProgressChange() {},
  onStatusChange() {},
  onSecurityChange() {},
  onLocationChange(aWebProgress, aRequest, aUri) {
    if (!URL2QR.enabled || !aWebProgress.isTopLevel || !this.win) {
      return;
    }

    let popupAnchor = URL2QR.elements.get(this.win).popupAnchor;
    popupAnchor.hidden = !(aUri.scheme == "http" ||
                           aUri.scheme == "https" ||
                           aUri.scheme == "ftp");
  }
};

this.URL2QR = {
  elements: new Map(),
  listeners: new Map(),
  prefKey: "extensions.cmimprove.url2qr.enabled",

  get styleSheet() {
    let spec = "chrome://cmimprove/skin/url2qr.css";
    delete this.styleSheet;
    return this.styleSheet = Services.io.newURI(spec);
  },
  get strings() {
    let spec = "chrome://cmimprove/locale/url2qr.properties";
    delete this.strings;
    return this.strings = Services.strings.createBundle(spec);
  },
  _(key) {
    return this.strings.GetStringFromName(key);
  },

  generateGIFwithFx(message) {
    try {
      let QR = require("devtools/shared/qrcode/index");
      let Encoder = require("devtools/shared/qrcode/encoder/index").Encoder;

      let quality = "L";
      let version = QR.findMinimumVersion(message, quality);
      let encoder = new Encoder(version, quality);
      encoder.addData(message);
      encoder.make();

      /**
       * cellSize is size of each modules in pixels. 4 * 2 means a margin of
       * 4 cells on both sides of the output.
       *
       * The goal here is to make sure the output image is at least about
       * 240 x 240px and the cellSize is no less than 2px, its default value.
       */
      let altCellSize = Math.floor(240 / (encoder.getModuleCount() + 4 * 2));
      let cellSize = Math.max(2, altCellSize);
      return encoder.createImgData(cellSize);
    } catch (e) {
      Cu.reportError(e);
      return {};
    }
  },

  popupShowing(evt) {
    let win = evt.target && evt.target.ownerGlobal;
    if (!win) {
      return;
    }
    let elements = this.elements.get(win);
    let uri = win.gBrowser.selectedBrowser.currentURI;
    if (!uri) {
      elements.popup.hidePopup();
    }

    elements.popupImage.src = this.generateGIFwithFx(uri.asciiSpec).src;
  },

  popupShown() {
    CETracking.track("url2qr-qrshown");
  },

  handleEvent(evt) {
    switch (evt.type) {
      case "popupshowing":
        return this.popupShowing(evt);
      case "popupshown":
        return this.popupShown(evt);
      default:
        return undefined;
    }
  },

  init(win) {
    this.createElements(win);

    if (win.gBrowser) {
      win.gBrowser.addProgressListener(this.listeners.get(win));
    } else if (win._gBrowser) {
      win._gBrowser.addProgressListener(this.listeners.get(win));
    } else {
      win.console.error("Neither gBrowser or _gBrowser ?");
    }
  },

  uninit(win) {
    win.gBrowser.removeProgressListener(this.listeners.get(win));

    this.destroyElements(win);
  },

  getWinUtils(win) {
    return win.QueryInterface(Ci.nsIInterfaceRequestor).
      getInterface(Ci.nsIDOMWindowUtils);
  },

  createElements(win) {
    let doc = win.document;

    let winUtils = this.getWinUtils(win);
    winUtils.loadSheet(this.styleSheet, winUtils.AUTHOR_SHEET);

    let mainPopupSet = doc.getElementById("mainPopupSet");
    let popup = doc.createElement("panel");
    popup.id = "mo-url2qr-popup";
    popup.setAttribute("type", "arrow");
    popup.setAttribute("noautofocus", "true");
    popup.setAttribute("orient", "vertical");
    popup.setAttribute("align", "center");
    popup.setAttribute("level", "top");
    popup.addEventListener("popupshowing", this);
    popup.addEventListener("popupshown", this);

    let popupImage = doc.createElement("image");

    let hbox = doc.createElement("hbox");
    let label = doc.createElement("label");
    label.setAttribute("value", this._("mo-url2qr.instructions"));
    hbox.appendChild(label);

    popup.appendChild(popupImage);
    popup.appendChild(hbox);
    mainPopupSet.appendChild(popup);

    let parent = doc.getElementById("page-action-buttons") ||
                 doc.getElementById("urlbar-icons");
    let popupAnchor = doc.createElement("image");
    popupAnchor.id = "mo-url2qr-icon";
    popupAnchor.classList.add("urlbar-button");
    popupAnchor.classList.add("urlbar-icon");
    popupAnchor.classList.add("urlbar-page-action");
    popupAnchor.setAttribute("hidden", "true");
    popupAnchor.setAttribute("tooltiptext", this._("mo-url2qr.generateQR"));
    popupAnchor.setAttribute("popup", popup.id);
    parent.insertBefore(popupAnchor, parent.firstChild);

    this.elements.set(win, { popup, popupAnchor, popupImage });
    this.listeners.set(win, new Listener(win));
  },

  destroyElements(win) {
    let winUtils = this.getWinUtils(win);
    winUtils.removeSheet(this.styleSheet, winUtils.AUTHOR_SHEET);

    let elements = this.elements.get(win);
    if (!elements) {
      return;
    }

    elements.popup.removeEventListener("popupshown", this);
    elements.popup.removeEventListener("popupshowing", this);
    elements.popup.remove();
    elements.popupAnchor.remove();

    this.elements.delete(win);
    this.listeners.delete(win);
  }
};

XPCOMUtils.defineLazyPreferenceGetter(URL2QR, "enabled", URL2QR.prefKey);
