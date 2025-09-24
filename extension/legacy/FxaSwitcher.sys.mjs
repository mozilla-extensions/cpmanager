/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  FxAccountsConfig: "resource://gre/modules/FxAccountsConfig.sys.mjs",
});

const AUTO_CONFIG_KEY = "identity.fxaccounts.autoconfig.uri";
const FXA_PREF_KEY = "identity.fxaccounts.auth.uri";
const PAIRING_PREF_KEY = "identity.fxaccounts.remote.pairing.uri";
const SYNC_PREF_KEY = "identity.sync.tokenserver.uri";

export let FxaSwitcher = {
  async init() {
    // Revert any settings from previous versions to default Firefox FxA
    try {
      ["identity.fxaccounts.autoconfig.uri", "identity.fxaccounts.auth.uri", "identity.fxaccounts.remote.pairing.uri", "identity.sync.tokenserver.uri", "identity.fxaccounts.oauth.enabled", "identity.fxaccounts.contextParam"].forEach(key => Services.prefs.clearUserPref(key));

      // Reset derived config URLs to product defaults
      lazy.FxAccountsConfig.resetConfigURLs();

      // Ensure any cached/configured values re-compute using defaults
      await lazy.FxAccountsConfig.ensureConfigured();
    } catch (e) {
      // Best-effort reset; ignore errors to avoid breaking startup.
    }
  },
};
