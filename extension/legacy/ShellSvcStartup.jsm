/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global globalThis */
// based on /browser/components/downloads/src/DownloadsStartup.js
this.EXPORTED_SYMBOLS = ["ShellSvcStartup"];

"use strict";

const Cm = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);

const kOrigShellSvcCid = Components.ID("{63c7b9f4-0cc8-43f8-b666-0a661655cb73}");
const kShellSvcCid = Components.ID("{055d195f-168e-4d98-b18a-71bfbfd3f617}");
const kShellSvcContractId = "@mozilla.org/browser/shell-service;1";
// Since Fx 104, see https://bugzil.la/1667455,1780695
const Services =
  globalThis.Services ||
  ChromeUtils.import("resource://gre/modules/Services.jsm").Services;

this.ShellSvcStartup = {
  get shouldApply() {
    delete this.shouldApply;
    return this.shouldApply = Services.appinfo.OS == "WINNT" &&
      Services.vc.compare(Services.sysinfo.getProperty("version"), "6.2") < 0 &&
      Services.vc.compare(Services.appinfo.version, "115.0") < 0;
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
