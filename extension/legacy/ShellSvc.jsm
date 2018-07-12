/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["ShellSvcProxy", "strings"];

const Cc = Components.classes;
const CD = Components.classesByID;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PlacesUtils",
  "resource://gre/modules/PlacesUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyGetter(this, "CETracking", function() {
  return Cc["@mozilla.com.cn/tracking;1"].getService().wrappedJSObject;
});

const origShellSvcID = "{63c7b9f4-0cc8-43f8-b666-0a661655cb73}";
const origShellSvc = CD[origShellSvcID].getService(Ci.nsIShellService);
try {
  origShellSvc.QueryInterface(Ci.nsIClassInfo);
} catch (e) {}
const workerURL = "resource://cpmanager/getExitCode.js";
const exeName = "helper.exe";
const helpURI = Services.io.newURI(
  "http://firefox.com.cn/help/default-browser/");
const osVer = Services.sysinfo.getProperty("version");
const log = aMsg => Services.console.logStringMessage(aMsg);

this.maybeOpenHelp = function(aExtra) {
  let p = Services.prompt;

  if (p.confirmEx(null, Services.appinfo.name,
        strings._("ShellSvcProxy.msg"),
        p.BUTTON_POS_0 * p.BUTTON_TITLE_IS_STRING,
        strings._("ShellSvcProxy.openHelp"), "", "",
        null, {}) === 0) {
    let w = Services.wm.getMostRecentWindow("navigator:browser");
    if (w && w.switchToTabHavingURI) {
      w.switchToTabHavingURI(helpURI, true);
    }

    CETracking.track("sdb-openhelp-" + aExtra);
  }
};

this.modShellSvc = Object.create(origShellSvc, {
  "setDefaultBrowser": {
    configurable: false,
    enumerable: true,
    writable: false,
    value(aClaimAllTypes, aForAllUsers) {
      let args = [].slice.call(arguments);
      try {
        PlacesUtils.history.hasVisits(helpURI).then(aIsVisited => {
          origShellSvc.setDefaultBrowser.apply(origShellSvc, args);

          try {
            let extra = osVer + "-" + (aIsVisited ? "a" : "b");

            CETracking.track("sdb-attempt-" + extra);

            let worker = new ChromeWorker(workerURL);
            worker.onmessage = function(aEvt) {
              if (!aEvt.data) {
                return;
              }

              switch (aEvt.data.type) {
                case "error":
                  log(aEvt.data.message + " (" + aEvt.data.code + ")");
                  break;
                case "exitcode":
                  log(aEvt.data.exeName + " exited with " + aEvt.data.code);

                  if (origShellSvc.isDefaultBrowser(false, aClaimAllTypes)) {
                    CETracking.track("sdb-success-" + extra);
                  } else {
                    CETracking.track("sdb-failure-" + extra);

                    maybeOpenHelp(extra);
                  }
                  break;
              }
            };
            worker.postMessage({ exeName });

            // clear the visits to helpURI
            PlacesUtils.history.remove(helpURI);
          } catch (ex) {
            Cu.reportError(ex);
          }
        }, ex => Cu.reportError(ex));
      } catch (ex) {
        origShellSvc.setDefaultBrowser.apply(origShellSvc, args);
        Cu.reportError(ex);
      }
    }
  }
});

this.strings = {
  _ctx: null,

  init(context) {
    this._ctx = context;
  },

  uninit() {
    delete this._ctx;
  },

  _(name, subs) {
    if (!this._ctx) {
      return "";
    }

    let cloneScope = this._ctx.cloneScope;
    return this._ctx.extension.localizeMessage(name, subs, {cloneScope});
  }
};

function ShellSvcProxy() {}

ShellSvcProxy.prototype = {
  classID: Components.ID("{055d195f-168e-4d98-b18a-71bfbfd3f617}"),
  contractID: null,
  QueryInterface(aIID) {
    if (aIID.equals(Ci.nsISupports)) {
      return modShellSvc;
    }
    /*
    if (aIID.equals(Ci.nsIClassInfo) && "classInfo" in modShellSvc) {
      return modShellSvc.classInfo;
    }
    */
    if (aIID.equals(Ci.nsIShellService)) {
      return modShellSvc;
    }
    if (aIID.equals(Ci.nsIWindowsShellService)) {
      return modShellSvc;
    }

    throw Cr.NS_ERROR_NO_INTERFACE;
  }
};
