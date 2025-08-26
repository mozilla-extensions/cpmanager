/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global Services, ExtensionAPI, ExtensionCommon, XPCOMUtils */

"use strict";

XPCOMUtils.defineLazyServiceGetter(this, "resProto",
  "@mozilla.org/network/protocol;1?name=resource",
  "nsISubstitutingProtocolHandler");

const RESOURCE_HOST = "cpmanager-legacy";
const GESTURE_PREF = "extensions.cmimprove.gesture.enabled";

if (Services.prefs.getCharPref("distribution.id", "").trim().toLowerCase() !== "mozillaonline") {
  throw new Error("This extension is not supported for this distribution!");
}

this.chinaPackManager = class extends ExtensionAPI {
  onStartup() {
    let {extension} = this;

    this.flushCacheOnUpgrade(extension);

    resProto.setSubstitutionWithFlags(RESOURCE_HOST,
      Services.io.newURI("legacy/", null, extension.rootURI), Ci.nsISubstitutingProtocolHandler.ALLOW_CONTENT_ACCESS);

    try {
      const { mozCNGuard } = ChromeUtils.importESModule("resource://cpmanager-legacy/CPManager.sys.mjs");
      this.mozCNGuard = mozCNGuard;
      this.mozCNGuard.init({ extension });
    } catch (ex) {
      console.error(ex);
    }
  }

  onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }

    try {
      this.mozCNGuard.uninit();

      resProto.setSubstitution(RESOURCE_HOST, null);
    } catch (ex) {
      console.error(ex);
    }
  }

  flushCacheOnUpgrade(extension) {
    if (extension.startupReason !== "ADDON_UPGRADE") {
      return;
    }

    // Taken from https://bugzil.la/1445739
    Services.obs.notifyObservers(null, "startupcache-invalidate");
    Services.obs.notifyObservers(null, "message-manager-flush-caches");
    Services.mm.broadcastAsyncMessage("AddonMessageManagerCachesFlush", null);
  }

  async sendLegacyMessage(message) {
    switch (message.type) {
      case "initOptions":
        let initOptions = {};
        for (let option of ["gesture", "url2qr", "fxa"]) {
          let prefKey = `extensions.cmimprove.${option}.enabled`;
          initOptions[option] = Services.prefs.getBoolPref(prefKey, true);
        }
        return initOptions;
      case "trackingEnabled":
        return {
          "trackingEnabled": false,
        };
      case "updateOptions":
        for (let option in message.detail) {
          let prefKey = `extensions.cmimprove.${option}.enabled`;
          Services.prefs.setBoolPref(prefKey, message.detail[option]);
        }
        return null;
      default:
        return null;
    }
  }

  getAPI(context) {
    let chinaPackManager = this;

    return {
      mozillaonline: {
        chinaPackManager: {
          onGesturePrefChange: new ExtensionCommon.EventManager({
            context,
            name: "mozillaonline.chinaPackManager.onGesturePrefChange",
            register: (fire, name) => {
              const callback = () => {
                fire.async(Services.prefs.getBoolPref(GESTURE_PREF)).catch(() => {});
              };
              Services.prefs.addObserver(GESTURE_PREF, callback);
              return () => {
                Services.prefs.removeObserver(GESTURE_PREF, callback);
              };
            },
          }).api(),
          async sendLegacyMessage(message) {
            return chinaPackManager.sendLegacyMessage(message);
          },
          async gestureEnabled() {
            return Services.prefs.getBoolPref("extensions.cmimprove.gesture.enabled", true);
          },
        },
      },
    };
  }
};
