/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global ExtensionAPI, ExtensionCommon */
ChromeUtils.defineModuleGetter(this, "XPCOMUtils",
  "resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyServiceGetter(this, "resProto",
  "@mozilla.org/network/protocol;1?name=resource",
  "nsISubstitutingProtocolHandler");
XPCOMUtils.defineLazyModuleGetters(this, {
  ExtensionPermissions: "resource://gre/modules/ExtensionPermissions.jsm",
  Services: "resource://gre/modules/Services.jsm",
});
XPCOMUtils.defineLazyGetter(this, "CETracking", () => {
  return Cc["@mozilla.com.cn/tracking;1"].getService().wrappedJSObject;
});
XPCOMUtils.defineLazyGlobalGetters(this, ["URL"]);

const { EventManager, makeWidgetId } = ExtensionCommon;

const RESOURCE_HOST = "cpmanager-legacy";
const TRACKING_BASE = "https://tracking.firefox.com.cn/cpmanager.gif";

this.downloadPrompts = {
  _activeDialogs: new Map(),

  _dialogProperties: {
    handleEvent: {
      value(aEvent) {
        switch (aEvent.type) {
          case "dialogaccept":
            if (this.mococnOnOK) {
              this.mococnOnOK(aEvent);
            } else {
              this.onOK(aEvent);
            }
            break;
          case "dialogcancel":
            this.onCancel();
            break;
          case "select":
            this.mococnOnSelect(aEvent);
            break;
        }
      },
    },

    mococnInitDialog: {
      value() {
        // Revert some changes made in `initDialog`;
        this.dialogElement("open").parentNode.collapsed = true;
        this.dialogElement("normalBox").collapsed = false;
        this.dialogElement("basicBox").collapsed = true;
        this.dialogElement("rememberChoice").hidden = true;

        let dialog = this.mDialog.document.getElementById("unknownContentType");
        let strBundle = dialog._strBundle;
        let acceptButton = dialog.getButton("accept");
        acceptButton.label = strBundle.GetStringFromName("button-accept");
        acceptButton.removeAttribute("icon");
        dialog.getButton(
          "cancel"
        ).label = strBundle.GetStringFromName("button-cancel");

        this.initInteractiveControls();

        // What else?
      },
    },

    mococnOnOK: {
      value(evt) {
        if (this.mococnSelectedExtensionOption.extWidgetId) {
          let data = Object.assign({}, this.mococnSelectedExtensionOption, {
            browsingContextId: this.mLauncher.browsingContextId,
            url: this.mLauncher.source.spec,
          });
          Services.obs.notifyObservers(
            this.mContext,
            "mococn-uct-takeover",
            JSON.stringify(data)
          );
          return this.onCancel();
        }

        // Services.obs.notifyObservers(null, "mococn-uct-takeover", "");
        return this.onOK(evt);
      },
    },

    // For now, don't allow remembering an extension provided choice at all.
    mococnOnSelect: {
      value(evt) {
        if (evt.target.id !== "mode") {
          return;
        }

        let rememberChoice = this.dialogElement("rememberChoice");
        if (this.mococnSelectedExtensionOption.extWidgetId) {
          rememberChoice.disabled = true;

          this.toggleRememberChoice({ checked: false });
        } else {
          rememberChoice.disabled = false;

          this.toggleRememberChoice(rememberChoice);
        }
      },
    },

    mococnSelectedExtensionOption: {
      get() {
        let prefix = "mococn-ext-";
        let selectedItem = this.dialogElement("mode").selectedItem;
        if (selectedItem.id.startsWith(prefix)) {
          let { extWidgetId, optionId } = selectedItem.dataset;
          return { extWidgetId, optionId };
        }
        return {};
      },
    },
  },

  _extensionHandlers: new Map(),
  _mutationObserverOptions: {
    attributeFilter: ["collapsed"],
  },
  _uctDialogUrl: "chrome://mozapps/content/downloads/unknownContentType.xhtml",

  get styleSheet() {
    let spec = "resource://cpmanager-legacy/skin/uct_tweaks.css";
    delete this.styleSheet;
    return this.styleSheet = Services.io.newURI(spec);
  },

  addExtensionChoices(document) {
    let { dialog } = document.defaultView;
    let launcherBC = dialog.mDialog.BrowsingContext.get(
      dialog.mLauncher.browsingContextId
    ).top;
    // `currentURI` only available on BrowsingContext since Fx 88,
    // see https://bugzil.la/1663757
    let topURI = launcherBC.currentURI || (
      launcherBC.embedderElement &&
      launcherBC.embedderElement.currentURI
    );

    let modeGroup = dialog.dialogElement("mode");
    let extraOptionCount = 0;
    for (let [extWidgetId, handlerDetails] of this._extensionHandlers) {
      for (let option of handlerDetails.options) {
        if (topURI && option.excluded.matches(topURI)) {
          continue;
        }

        let id = `mococn-ext-${extWidgetId}-${option.id}`;
        let radio = modeGroup.appendItem(option.label, "");
        radio.id = id;
        radio.dataset.extWidgetId = extWidgetId;
        radio.dataset.optionId = option.id;
        extraOptionCount += 1;
      }
    }
    if (extraOptionCount < 1) {
      return;
    }

    let winUtils = dialog.mDialog.windowUtils;
    winUtils.loadSheet(this.styleSheet, winUtils.AUTHOR_SHEET);
    Object.defineProperties(dialog, this._dialogProperties);
    modeGroup.addEventListener("select", dialog);

    let mutationObserver = new dialog.mDialog.MutationObserver(
      this.mutationCallback.bind(this)
    );
    mutationObserver.observe(
      dialog.dialogElement("normalBox"),
      this._mutationObserverOptions
    );
    dialog.mDialog.addEventListener("load", () => {
      Services.tm.dispatchToMainThread(() => mutationObserver.disconnect());
    }, { once: true });

    chinaPackManager.sendLegacyMessage({
      data: {
        category: "panBaidu",
        object: "uctOfflineDownload",
        method: "shown",
      },
      dir: "bg2legacy",
      type: "sendTracking",
    });
  },

  handleEvent(evt) {
    if (evt.target.location.href !== this._uctDialogUrl) {
      return;
    }

    this.addExtensionChoices(evt.target);
  },

  handleUCTTakenOver(chromeWin, dataStr) {
    if (!(chromeWin && chromeWin instanceof Ci.nsIDOMChromeWindow)) {
      return;
    }
    let data = JSON.parse(dataStr);

    let {
      callback,
      extension: { tabManager },
    } = this._extensionHandlers.get(data.extWidgetId);

    let launcherBC = chromeWin.BrowsingContext.get(data.browsingContextId).top;
    let nativeTab = launcherBC.embedderElement &&
      chromeWin.gBrowser.getTabForBrowser(launcherBC.embedderElement);

    callback({
      id: data.optionId,
      url: data.url,
    }, nativeTab ? tabManager.convert(nativeTab) : null);
  },

  init() {
    Services.ww.registerNotification(this);
    Services.obs.addObserver(this, "mococn-uct-takeover");
  },

  mutationCallback(records, observer) {
    for (let record of records) {
      if (
        record.type !== "attributes" ||
        record.attributeName !== "collapsed"
      ) {
        continue;
      }

      let { dialog } = record.target.ownerGlobal;

      Services.tm.dispatchToMainThread(() => dialog.mococnInitDialog());
      observer.disconnect();
      break;
    }
  },

  observe(subject, topic, data) {
    switch (topic) {
      case "domwindowopened":
        if (!(subject instanceof Ci.nsIDOMWindow)) {
          break;
        }

        subject.addEventListener("DOMContentLoaded", this, { once: true });
        break;
      case "mococn-uct-takeover":
        this.handleUCTTakenOver(subject, data);
        break;
      default:
        break;
    }
  },

  off(extWidgetId) {
    this._extensionHandlers.delete(extWidgetId);
  },

  on(extWidgetId, handlerDetails) {
    for (let option of handlerDetails.options) {
      option.excluded = new MatchPatternSet(option.notFor);
    }
    this._extensionHandlers.set(extWidgetId, handlerDetails);
  },

  uninit() {
    Services.obs.removeObserver(this, "mococn-uct-takeover");
    Services.ww.unregisterNotification(this);
  },
};

this.chinaPackManager = class extends ExtensionAPI {
  onStartup() {
    let {extension} = this;

    this.flushCacheOnUpgrade(extension);

    resProto.setSubstitution(RESOURCE_HOST,
      Services.io.newURI("legacy/", null, extension.rootURI));

    try {
      ChromeUtils.import("resource://cpmanager-legacy/CPManager.jsm", this);
      this.mozCNGuard.init({ extension });
      downloadPrompts.init();
    } catch (ex) {
      console.error(ex);
    }
  }

  onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }

    try {
      downloadPrompts.uninit();
      this.mozCNGuard.uninit();
      Cu.unload("resource://cpmanager-legacy/CPManager.jsm");

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

  static async sendLegacyMessage(message) {
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
      case "sendTracking":
        let data = Object.assign({
          category: "",
          object: "",
          method: "",
          value: "notSet",
          extra: "",
        }, message.data);
        let url = new URL(TRACKING_BASE);
        url.searchParams.append("c", data.category);
        url.searchParams.append("t", data.object);
        url.searchParams.append("a", data.method);
        url.searchParams.append("d", data.value.toString());
        url.searchParams.append("f", data.extra);
        url.searchParams.append("r", Math.random());
        url.searchParams.append("cid", "");
        return CETracking.send(url);
      case "trackingEnabled":
        return {
          "trackingEnabled": CETracking.ude,
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
    let { extension } = context;
    let extWidgetId = makeWidgetId(extension.id);

    return {
      mozillaonline: {
        chinaPackManager: {
          async addPermissions(perms) {
            // Since Fx 79, see https://bugzil.la/1642956
            let allowedOrigins =
              extension.allowedOrigins || extension.whiteListedHosts;

            if (
              perms.permissions.every(perm => extension.hasPermission(perm)) &&
              perms.origins.every(origin => {
                return allowedOrigins.subsumes(new MatchPattern(origin));
              })
            ) {
              // Permissions already granted
              return false;
            }

            await ExtensionPermissions.add(extension.id, perms, extension);
            return true;
          },

          async sendLegacyMessage(message) {
            return chinaPackManager.sendLegacyMessage(message);
          },

          onUCTTakenOver: new EventManager({
            context,
            name: "chinaPackManager.onUCTTakenOver",
            inputHandling: true,
            register: (fire, options) => {
              let callback = (...args) => fire.async(...args);
              downloadPrompts.on(extWidgetId, {
                callback,
                extension,
                options,
              });
              return () => {
                downloadPrompts.off(extWidgetId);
              };
            },
          }).api(),
        },
      },
    };
  }
};
