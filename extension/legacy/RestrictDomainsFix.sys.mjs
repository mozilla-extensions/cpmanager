/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PREF = "extensions.webextensions.restrictedDomains";
const DOMAINS = [
  "accounts.firefox.com.cn",
  "api-accounts.firefox.com.cn",
  "channelserver.firefox.com.cn",
  "firefox.com.cn",
  "full.firefox.com.cn",
  "safebrowsing-cache.firefox.com.cn",
  "sb.firefox.com.cn",
  "stub.esr.firefox.com.cn"
  "stub.firefox.com.cn",
  "sync.firefox.com.cn",
  "www.firefox.com.cn",
];

export let RestrictDomainsFix = {
  init() {
    const restrictedDomains = Services.prefs.getStringPref(PREF, "").split(",");

    const result = [...new Set([...restrictedDomains, ...DOMAINS])];
    if (result.length !== restrictedDomains.length) {
      Services.prefs.setStringPref(PREF, result.join(","));
    }
  }
};
