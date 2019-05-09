/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["mozCNSafeBrowsing"];

ChromeUtils.defineModuleGetter(this, "XPCOMUtils",
  "resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  "clearTimeout": "resource://gre/modules/Timer.jsm", /* global clearTimeout */
  "SafeBrowsing": "resource://gre/modules/SafeBrowsing.jsm", /* global SafeBrowsing */
  "Services": "resource://gre/modules/Services.jsm", /* global Services */
  "setTimeout": "resource://gre/modules/Timer.jsm" /* global setTimeout */
});

XPCOMUtils.defineLazyServiceGetter(this, "dbService",
  "@mozilla.org/url-classifier/dbservice;1", "nsIUrlClassifierDBService");
XPCOMUtils.defineLazyServiceGetter(this, "gMM",
  "@mozilla.org/globalmessagemanager;1", "nsIMessageListenerManager");
XPCOMUtils.defineLazyServiceGetter(this, "listManager",
  "@mozilla.org/url-classifier/listmanager;1", "nsIUrlListManager");

XPCOMUtils.defineLazyGetter(this, "CETracking", function() {
  return Cc["@mozilla.com.cn/tracking;1"].getService().wrappedJSObject;
});

// Available since Fx 62, https://bugzil.la/1464548
if (XPCOMUtils.defineLazyGlobalGetters) {
  XPCOMUtils.defineLazyGlobalGetters(this, ["fetch"]);
} else {
  Cu.importGlobalProperties(["fetch"]);
}

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

  async getRatio() {
    let ratios = [0.1, 0.2, 0.4, 0.8, 1.0];
    try {
      let response = await fetch("https://safebrowsing-cache.firefox.com.cn/uptake/ratios.json");
      let json = await response.json();
      if (Array.isArray(json) && json.length && json.every(item => !isNaN(item))) {
        ratios = json;
      }
    } catch (ex) {
      Cu.reportError(ex);
    }

    // Increase ratios on each startup to speed this up a little bit.
    let branch = Services.prefs.getBranch("extensions.cpmanager.safeflag.");
    ratios = branch.getCharPref("uptake.0", ratios.join(",")).split(",").map(parseFloat);
    let percent = 100 * ratios[branch.getIntPref("restart.0", 0)];
    return branch.getIntPref("percent.0", (isNaN(percent) ? 100 : percent)) / 100;
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

    // Keep it aqksb-phish-shavar only if already enabled
    let provider = {
      gethashURL: "https://sb.firefox.com.cn/gethash?pver=2.2",
      listTypes: (Services.prefs.getCharPref("extensions.cpmanager.safeflag.listtypes.0",
        "aqksb-phish-shavar,m6eb-phish-shavar")).split(","),
      slug: "mozcn",
      updateURL: "https://sb.firefox.com.cn/downloads?pver=2.2"
    };

    // Existence of "...provider.{slug}.{last,next}updatetime" prefs will
    // make Fx try to register the relevant providers.
    let prefix = "browser.safebrowsing.provider." + provider.slug + ".";
    if (Services.prefs.getChildList(prefix, {}).length > 0) {
      let providerBranch = Services.prefs.getDefaultBranch(prefix);
      providerBranch.setCharPref("gethashURL", provider.gethashURL);
      providerBranch.setCharPref("lists", provider.listTypes.join(","));
      providerBranch.setCharPref("updateURL", provider.updateURL);

      for (let listType of provider.listTypes) {
        let type = listType.split("-")[1];
        listsToLookup[type] = listsToLookup[type] || [];
        listsToLookup[type].push(listType);
      }

      this.maybeDisableAQKSB(provider);
    } else {
      // Switch to m6eb-phish-shavar if aqksb-phish-shavar not already enabled
      Services.prefs.setCharPref("extensions.cpmanager.safeflag.listtypes.0", "m6eb-phish-shavar");
      provider.listTypes = ["m6eb-phish-shavar"];

      this.providers.push(provider);
    }

    this.addListsToLookup(listsToLookup);

    if (this.providers.length) {
      this.maybeRegister();
    }
  },

  maybeDisableAQKSB(provider) {
    if (!provider.listTypes.includes("aqksb-phish-shavar")) {
      return;
    }

    Services.obs.addObserver(this, "safebrowsing-update-finished");
  },

  maybeRegister() {
    // Same here, we need to make sure the internal safe browsing has been
    // initialized, so the gethashurl won't be override.
    if (!SafeBrowsing.initialized) {
      this.delayTimeout = setTimeout(() => {
        this.maybeRegister();
      }, 1e3);
      return;
    }

    clearTimeout(this.delayTimeout);

    Promise.all([new Promise(resolve => {
      dbService.getTables(resolve);
    }), this.getRatio()]).then(([tables, ratio]) => {
      let listsToLookup = {};

      for (let provider of this.providers) {
        let enableIfNotAlready = Math.random() <= (provider.ratio || ratio);
        let prefKey = "extensions.cpmanager.safeflag.restart.0";
        Services.prefs.setIntPref(prefKey, Services.prefs.getIntPref(prefKey, 0) + 1);

        for (let listType of provider.listTypes) {
          // Looks like this will always be false?
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
  },

  observe(subject, topic, data) {
    if (topic !== "safebrowsing-update-finished" || data !== "success") {
      return;
    }

    dbService.getTables(tables => {
      if (tables.split("\n").filter(table => table.startsWith("aqksb-")).length) {
        return;
      }

      Services.prefs.setCharPref("extensions.cpmanager.safeflag.listtypes.0", "m6eb-phish-shavar");
    });
  },

  uninit() {
    try {
      Services.obs.removeObserver(this, "safebrowsing-update-finished");
    } catch (ex) {
      Cu.reportError(ex);
    }
  }
};
