/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(function() {
  var init = function() {
    try {
      Components.utils.import("resource://gre/modules/AddonManager.jsm");
      AddonManager.getAddonByID("safeflag@mozillaonline.com", function(addon) {
        if (!addon)
          return;
        addon.uninstall();
      });
    } catch (e) {}
  };
  window.addEventListener('load', init, false)
})();
