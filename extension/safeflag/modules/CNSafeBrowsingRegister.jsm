/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

var EXPORTED_SYMBOLS = ["mozCNSafeBrowsing"];

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, 'SafeBrowsing',
  'resource://gre/modules/SafeBrowsing.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'setTimeout',
  'resource://gre/modules/Timer.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'clearTimeout',
  'resource://gre/modules/Timer.jsm');

let timer = null;

let listTypes = 'utnpnb-phish-shavar,aqksb-phish-shavar';
let domain = Services.prefs.getCharPref('extensions.cpmanager.safeflag.provider');
let dbService = Cc["@mozilla.org/url-classifier/dbservice;1"].
                  getService(Ci.nsIUrlClassifierDBService);
let listManager = Cc["@mozilla.org/url-classifier/listmanager;1"].
                    getService(Ci.nsIUrlListManager);
let mozCNSafeBrowsing = {
  updateURL: (domain + 'downloads?pver=2.2'),
  gethashURL: (domain + 'gethash?pver=2.2'),

  latestUpdateKey: "extensions.cpmanager.safeflag.latestUpdate",
  delayTimeSpan: (4 * 3600e3),
  get latestUpdate() {
    let latestUpdate = 0;
    try {
      latestUpdate = Services.prefs.getIntPref(this.latestUpdateKey) * 60e3;
    } catch(e) {};
    return latestUpdate;
  },
  set latestUpdate(latestUpdate) {
    try {
      latestUpdate = Math.ceil(latestUpdate / 60e3);
      Services.prefs.setIntPref(this.latestUpdateKey, latestUpdate);
    } catch(e) {};
  },
  get updateDelay() {
    let latestUpdate = this.latestUpdate;
    let now = Date.now();
    if (!latestUpdate || latestUpdate > now) {
      return Math.ceil(Math.random() * this.delayTimeSpan);
    }

    let sinceLastUpdate = now - latestUpdate;
    return this.delayTimeSpan - sinceLastUpdate % this.delayTimeSpan;
  }
};

function maybeRegister() {
  // Same here, we need to make sure the internal safe browsing has been
  // initialized, so the gethashurl won't be override.
  if (!SafeBrowsing.initialized) {
    timer = setTimeout(maybeRegister, 1e3);
    return;
  }

  clearTimeout(timer);

  dbService.getTables(function(tables) {
    let listTypeExisted = listTypes.split(",").some(function(listType) {
      return tables.indexOf(listType) > -1;
    });
    if (!listTypeExisted && Math.random() > 0.1) {
      return;
    }

    // We need to set the pref before `lookup`, otherwise `lookup` won't
    // work when querying our own list type.
    Services.prefs.setCharPref('urlclassifier.phishTable',
      'goog-phish-shavar,' + listTypes + ',test-phish-simple');

    listTypes.split(',').forEach(aListType => {
      listManager.registerTable(aListType,
        mozCNSafeBrowsing.updateURL, mozCNSafeBrowsing.gethashURL);
    });

    timer = setTimeout(function() {
      listTypes.split(',').forEach(aListType => {
        listManager.enableUpdate(aListType);
      });

      // `maybeToggleUpdateChecking` is introduced in <https://bugzil.la/1036684>
      if (listManager.maybeToggleUpdateChecking) {
        listManager.maybeToggleUpdateChecking();
      }
    }, mozCNSafeBrowsing.updateDelay);
  });
}

// We have to clear the pref everytime FF restart, otherwise
// the gethashurl will be override, see:
//   https://dxr.mozilla.org/mozilla-central/source/toolkit/components/url-classifier/SafeBrowsing.jsm#60
Services.prefs.clearUserPref('urlclassifier.phishTable');
maybeRegister();

