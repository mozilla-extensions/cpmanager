/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global ExtensionAPI, Services, XPCOMUtils */
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyServiceGetter(this, "resProto",
  "@mozilla.org/network/protocol;1?name=resource",
  "nsISubstitutingProtocolHandler");

const RESOURCE_HOST = "cpmanager";

this.chinaPackManager = class extends ExtensionAPI {
  onShutdown(reason) {
    console.log(`chinaPackManager onShutdown with reason: ${reason}`);

    resProto.setSubstitution(RESOURCE_HOST, null);
  }

  async sendLegacyMessage(message) {
    switch (message.type) {
      case "initOptions":
        let initOptions = {};
        for (let option of ["gesture", "url2qr"]) {
          let prefKey = `extensions.cmimprove.${option}.enabled`;
          initOptions[option] = Services.prefs.getBoolPref(prefKey, true);
        }
        return initOptions;
      case "migratePrefs":
        let prefsToMigrate = {};
        for (let prefKey of message.prefKeys) {
          if (!Services.prefs.prefHasUserValue(prefKey)) {
            continue;
          }

          switch (Services.prefs.getPrefType(prefKey)) {
            case Services.prefs.PREF_INT:
              prefsToMigrate[prefKey] = Services.prefs.getIntPref(prefKey);
              break;
            default:
              break;
          }

          Services.prefs.clearUserPref(prefKey);
        }
        return prefsToMigrate;
      case "trackingEnabled":
        return {
          "trackingEnabled": false // CETracking.ude
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

  startup(context) {
    resProto.setSubstitution(RESOURCE_HOST,
      Services.io.newURI("legacy/", null, context.extension.rootURI));

    ChromeUtils.import("resource://cpmanager/CPManager.jsm", this);
    this.mozCNGuard.init(undefined, context);
  }

  getAPI(context) {
    let chinaPackManager = this;

    return {
      mozillaonline: {
        chinaPackManager: {
          async sendLegacyMessage(message) {
            return chinaPackManager.sendLegacyMessage(message);
          },

          async startup() {
            return chinaPackManager.startup(context);
          },
        },
      },
    };
  }
};
