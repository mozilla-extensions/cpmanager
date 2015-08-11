/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(function() {
  Components.utils.import("resource://cmaddoninstaller/common.js");
  Components.utils.import("resource://cmaddoninstaller/installerService.js");

  /**
   * cpAddonInstallerChrome namespace.
   */
  if ("undefined" == typeof(cpAddonInstallerChrome)) {
    cpAddonInstallerChrome = {};
  };

  /**
   * Controls the browser overlay.
   */
  cpAddonInstallerChrome.Overlay = {
    /* Logger for this object. */
    _logger : null,

    /**
     * Initializes the object.
     */
    init : function() {
      this._logger = cpAddonInstaller.getLogger("cpAddonInstallerChrome.Overlay");
      this._logger.debug("init");
      cpAddonInstaller.InstallerService.preventAddonManager();
      cpAddonInstaller.InstallerService.startInstallProcess();
    }
  };

  window.addEventListener("load", function() {
    try {
      cpAddonInstallerChrome.Overlay.init();
    } catch (e) {
      cpAddonInstallerChrome.Overlay._logger.error(e);
    }
  }, false);
})();
