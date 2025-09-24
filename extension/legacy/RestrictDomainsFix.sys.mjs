/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PREF = "extensions.webextensions.restrictedDomains";
const DOMAINS = [
  "accounts.firefox.com.cn",
  "api-accounts.firefox.com.cn",
];

export let RestrictDomainsFix = {
  init() {
    const defaultPrefs = Services.prefs.getDefaultBranch("");
    const restrictedDomains = defaultPrefs.getStringPref(PREF, "").split(",");

    // Remove any of our DOMAINS from the current restricted list.
    const result = restrictedDomains.filter(d => !DOMAINS.includes(d));
    if (result.length !== restrictedDomains.length) {
      defaultPrefs.setStringPref(PREF, result.join(","));
    }
  }
};
