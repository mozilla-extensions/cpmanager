/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  require: "resource://devtools/shared/loader/Loader.sys.mjs"
});

function Listener(win) {
  this.win = win;
}
Listener.prototype = {
  QueryInterface: ChromeUtils.generateQI([
    Ci.nsISupportWeakReference,
    Ci.nsIWebProgressListener,
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
  },
};

export let URL2QR = {
  elements: new Map(),
  listeners: new Map(),
  prefKey: "extensions.cmimprove.url2qr.enabled",

  get styleSheet() {
    let spec = "resource://cpmanager-legacy/skin/url2qr.css";
    delete this.styleSheet;
    return this.styleSheet = Services.io.newURI(spec);
  },

  generateGIFwithFx(message) {
    try {
      let QR = lazy.require("devtools/shared/qrcode/index");
      let Encoder = lazy.require("devtools/shared/qrcode/encoder/index").Encoder;

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
      console.error(e);
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

  popupShown() {},

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

  init(win, strings) {
    try {
      this.createElements(win, strings);

      if (win.gBrowser) {
        win.gBrowser.addProgressListener(this.listeners.get(win));
      } else if (win._gBrowser) {
        win._gBrowser.addProgressListener(this.listeners.get(win));
      } else {
        win.console.error("Neither gBrowser or _gBrowser ?");
      }
    } catch (ex) {
      win.console.error(ex);
    }
  },

  uninit(win) {
    win.gBrowser.removeProgressListener(this.listeners.get(win));

    this.destroyElements(win);
  },

  createElements(win, strings) {
    let doc = win.document;

    let winUtils = win.windowUtils;
    winUtils.loadSheet(this.styleSheet, winUtils.AUTHOR_SHEET);

    let mainPopupSet = doc.getElementById("mainPopupSet");
    let popup = doc.createXULElement("panel");
    popup.id = "mo-url2qr-popup";
    popup.setAttribute("type", "arrow");
    popup.setAttribute("noautofocus", "true");
    popup.setAttribute("orient", "vertical");
    popup.setAttribute("align", "center");
    popup.setAttribute("level", "top");
    popup.addEventListener("popupshowing", this);
    popup.addEventListener("popupshown", this);

    let popupImage = doc.createXULElement("image");

    let hbox = doc.createXULElement("hbox");
    let label = doc.createXULElement("label");
    label.setAttribute("value", strings._("URL2QR.instructions"));
    hbox.appendChild(label);

    popup.appendChild(popupImage);
    popup.appendChild(hbox);
    mainPopupSet.appendChild(popup);

    let pageActionButtons = doc.getElementById("page-action-buttons");
    let popupAnchor = doc.createXULElement("image");
    popupAnchor.id = "mo-url2qr-icon";
    popupAnchor.classList.add("urlbar-icon");
    popupAnchor.classList.add("urlbar-page-action");
    popupAnchor.setAttribute("hidden", "true");
    popupAnchor.setAttribute("tooltiptext", strings._("URL2QR.generateQR"));
    popupAnchor.setAttribute("popup", popup.id);
    pageActionButtons.insertBefore(popupAnchor, pageActionButtons.firstChild);

    this.elements.set(win, { popup, popupAnchor, popupImage });
    this.listeners.set(win, new Listener(win));
  },

  destroyElements(win) {
    let winUtils = win.windowUtils;
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
  },
};

XPCOMUtils.defineLazyPreferenceGetter(URL2QR, "enabled", URL2QR.prefKey);
