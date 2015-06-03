/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

var EXPORTED_SYMBOLS = ["GetHashURL"];

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
let DownloadsURL = domain + 'downloads?pver=2.2';
let GetHashURL = domain + 'gethash?pver=2.2';

function maybeRegister() {
  // Same here, we need to make sure the internal safe browsing has been
  // initialized, so the gethashurl won't be override.
  if (!SafeBrowsing.initialized) {
    timer = setTimeout(maybeRegister, 1000);
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
      listManager.registerTable(aListType, DownloadsURL, GetHashURL);
      listManager.enableUpdate(aListType);
    });

    // `maybeToggleUpdateChecking` is introduced in <https://bugzil.la/1036684>
    if (listManager.maybeToggleUpdateChecking) {
      listManager.maybeToggleUpdateChecking();
    }
  });
}

// We have to clear the pref everytime FF restart, otherwise
// the gethashurl will be override, see:
//   https://dxr.mozilla.org/mozilla-central/source/toolkit/components/url-classifier/SafeBrowsing.jsm#60
Services.prefs.clearUserPref('urlclassifier.phishTable');
maybeRegister();

