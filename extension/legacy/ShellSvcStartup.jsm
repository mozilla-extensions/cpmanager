// based on /browser/components/downloads/src/DownloadsStartup.js
this.EXPORTED_SYMBOLS = ["ShellSvcStartup"];

"use strict";

const Cm = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);

ChromeUtils.defineModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

const kOrigShellSvcCid = Components.ID("{63c7b9f4-0cc8-43f8-b666-0a661655cb73}");
const kShellSvcCid = Components.ID("{055d195f-168e-4d98-b18a-71bfbfd3f617}");
const kShellSvcContractId = "@mozilla.org/browser/shell-service;1";

this.ShellSvcStartup = {
  get shouldApply() {
    delete this.shouldApply;
    return this.shouldApply = Services.appinfo.OS == "WINNT" &&
      Services.vc.compare(Services.sysinfo.getProperty("version"), "6.2") < 0 &&
      Services.vc.compare(Services.appinfo.version, "105.0") < 0;
  },

  _init() {
    Cm.registerFactory(kShellSvcCid, "",
                       kShellSvcContractId, null);
  },

  init() {
    if (!this.shouldApply) {
      return;
    }

    this._init();
  },

  uninit() {
    if (!this.shouldApply) {
      return;
    }

    // does this work?
    Cm.registerFactory(kOrigShellSvcCid, "",
                       kShellSvcContractId, null);
  },
};
