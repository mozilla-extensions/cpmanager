/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
});

export let mozCNSafeBrowsing = {

  cachedLookupTables: {},
  get lookupBranch() {
    let prefix = "urlclassifier.";

    // use default branch so we don't have to clear it on next startup
    delete this.lookupBranch;
    return this.lookupBranch = Services.prefs.getDefaultBranch(prefix);
  },

  defaultPrefTweak() {
    for (let tablePref in this.cachedLookupTables) {
      let tables = this.cachedLookupTables[tablePref];
      this.lookupBranch.setCharPref(tablePref, tables);
    }
  },

  addListsToLookup(aListsToLookup) {
    // Enable lookup of additional list types.
    let tableForTypes = {
      "malware": "malwareTable",
      "phish": "phishTable",
    };
    for (let type in aListsToLookup) {
      let tablePref = tableForTypes[type];
      let originalTables = this.lookupBranch.getCharPref(tablePref).split(",");
      let tables = new Set(originalTables);
      for (let table of aListsToLookup[type]) {
        tables.add(table);
      }
      tables = Array.from(tables).join(",");
      this.cachedLookupTables[tablePref] = tables;
      this.lookupBranch.setCharPref(tablePref, tables);
    }
  },

  init() {
    let baiduBranch = Services.prefs.
      getDefaultBranch("browser.safebrowsing.provider.baidu.");
    baiduBranch.setCharPref("advisoryName", "Baidu Safe Browsing");
    baiduBranch.setCharPref("advisoryURL", "https://bsb.baidu.com/");
    baiduBranch.setCharPref("gethashURL", "https://download.api.bsb.baidu.com/gethash?ver=2.2&key=ffD7Y9anV5dZVp8");
    baiduBranch.setCharPref("lists", "baidu-malware-shavar,baidu-phish-shavar");
    baiduBranch.setCharPref("reportMalwareMistakeURL", "https://bsb.baidu.com/appeal?url=");
    baiduBranch.setCharPref("reportPhishMistakeURL", "https://bsb.baidu.com/appeal?url=");
    baiduBranch.setCharPref("updateURL", "https://download.api.bsb.baidu.com/downloads?ver=2.2&key=ffD7Y9anV5dZVp8");

    // user pref set in previous versions
    if (Services.prefs.prefHasUserValue("urlclassifier.phishTable")) {
      Services.prefs.clearUserPref("urlclassifier.phishTable");
    }

    let listsToLookup = {
      "malware": ["baidu-malware-shavar"],
      "phish": ["baidu-phish-shavar"],
    };

    // Cleanup any legacy user prefs referencing the deprecated mozcn provider
    try {
      for (let pref of Services.prefs.getChildList("browser.safebrowsing.provider.mozcn.", {})) {
        if (Services.prefs.prefHasUserValue(pref)) {
          Services.prefs.clearUserPref(pref);
        }
      }
      for (let pref of Services.prefs.getChildList("extensions.cpmanager.safeflag.", {})) {
        if (Services.prefs.prefHasUserValue(pref)) {
          Services.prefs.clearUserPref(pref);
        }
      }
    } catch (ex) {
      console.error(ex);
    }

    this.addListsToLookup(listsToLookup);
  },
};
