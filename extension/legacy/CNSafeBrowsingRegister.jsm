/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

var EXPORTED_SYMBOLS = ["mozCNSafeBrowsing"];

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "SafeBrowsing",
  "resource://gre/modules/SafeBrowsing.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "setTimeout",
  "resource://gre/modules/Timer.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "clearTimeout",
  "resource://gre/modules/Timer.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "dbService",
  "@mozilla.org/url-classifier/dbservice;1", "nsIUrlClassifierDBService");
XPCOMUtils.defineLazyServiceGetter(this, "gMM",
  "@mozilla.org/globalmessagemanager;1", "nsIMessageListenerManager");
XPCOMUtils.defineLazyServiceGetter(this, "listManager",
  "@mozilla.org/url-classifier/listmanager;1", "nsIUrlListManager");

XPCOMUtils.defineLazyGetter(this, "CETracking", function() {
  return Cc["@mozilla.com.cn/tracking;1"].getService().wrappedJSObject;
});

let mozCNSafeBrowsing = {
  providers: [],

  cachedLookupTables: {},
  get lookupBranch() {
    let prefix = "urlclassifier.";

    // use default branch so we don't have to clear it on next startup
    delete this.lookupBranch;
    return this.lookupBranch = Services.prefs.getDefaultBranch(prefix);
  },

  delayTimeout: undefined,

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
      "phish": "phishTable"
    }
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
      "phish": ["baidu-phish-shavar"]
    };

    let provider = {
      gethashURL: "https://sb.firefox.com.cn/gethash?pver=2.2",
      listTypes: ["aqksb-phish-shavar"],
      name: "anquan.org",
      ratio: (Services.prefs.getIntPref("extensions.cpmanager.safeflag.percent.0", 10) / 100),
      reportURL: "https://appeal.anquan.org/?domain=",
      slug: "mozcn",
      updateURL: "https://sb.firefox.com.cn/downloads?pver=2.2",
      url: "https://www.anquan.org/"
    };

    // Existence of "...provider.{slug}.{last,next}updatetime" prefs will
    // make Fx try to register the relevant providers.
    let prefix = "browser.safebrowsing.provider." + provider.slug + ".";
    if (Services.prefs.getChildList(prefix, {}).length > 0) {
      let providerBranch = Services.prefs.getDefaultBranch(prefix);
      providerBranch.setCharPref("advisoryName", provider.name);
      providerBranch.setCharPref("advisoryURL", provider.url);
      providerBranch.setCharPref("gethashURL", provider.gethashURL);
      providerBranch.setCharPref("lists", provider.listTypes.join(","));
      providerBranch.setCharPref("updateURL", provider.updateURL);
      providerBranch.setCharPref("reportMalwareMistakeURL", provider.reportURL);
      providerBranch.setCharPref("reportPhishMistakeURL", provider.reportURL);

      for (let listType of provider.listTypes) {
        let type = listType.split("-")[1];
        listsToLookup[type] = listsToLookup[type] || [];
        listsToLookup[type].push(listType);
      }
    } else {
      this.providers.push(provider);
    }

    this.addListsToLookup(listsToLookup);

    if (this.providers.length) {
      this.maybeRegister();
    }
  },

  uninit() {},

  maybeRegister() {
    // Same here, we need to make sure the internal safe browsing has been
    // initialized, so the gethashurl won't be override.
    if (!SafeBrowsing.initialized) {
      this.delayTimeout = setTimeout(() => {
        this.maybeRegister()
      }, 1e3);
      return;
    }

    clearTimeout(this.delayTimeout);

    dbService.getTables((tables) => {
      let listsToLookup = {};

      for (let provider of this.providers) {
        let enableIfNotAlready = Math.random() <= provider.ratio;

        for (let listType of provider.listTypes) {
          let alreadyEnabled = tables.indexOf(listType) > -1;

          if (!alreadyEnabled && !enableIfNotAlready) {
            continue;
          }

          let type = listType.split("-")[1];
          listsToLookup[type] = listsToLookup[type] || [];
          listsToLookup[type].push(listType);

          listManager.registerTable(listType, provider.slug,
            provider.updateURL, provider.gethashURL);
          listManager.enableUpdate(listType);
        }
      }
      listManager.maybeToggleUpdateChecking();

      this.addListsToLookup(listsToLookup);
    });
  }
};
