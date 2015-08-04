/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

var EXPORTED_SYMBOLS = ['safeflag'];

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, 'Services',
  "resource://gre/modules/Services.jsm");

var _ucdbSvc = Cc["@mozilla.org/url-classifier/dbservice;1"].
                 getService(Ci.nsIUrlClassifierDBService);

const MALWARE_LIST_TYPES = ['goog-malware-shavar', 'googpub-malware-shavar'];
const UNWANTED_LIST_TYPES = ['goog-unwanted-shavar'];
const GOOG_PHISH_LIST_TYPES = ['goog-phish-shavar', 'googpub-phish-shavar'];
const CN_PHISH_LIST_TYPES = ['utnpnb-phish-shavar', 'aqksb-phish-shavar'];
const GOOG_LIST_TYPES = MALWARE_LIST_TYPES.concat(UNWANTED_LIST_TYPES).concat(GOOG_PHISH_LIST_TYPES);
const PHISH_LIST_TYPES = GOOG_PHISH_LIST_TYPES.concat(CN_PHISH_LIST_TYPES);
const LOOKUP_TABLE = MALWARE_LIST_TYPES.concat(GOOG_PHISH_LIST_TYPES).
 concat(CN_PHISH_LIST_TYPES).join(',')

function doLookup(aUrl, aTables, aCallback) {
  let principal = Services.scriptSecurityManager.
    getNoAppCodebasePrincipal(Services.io.newURI(aUrl, null, null));

  try {
    // since FF30, see <https://bugzil.la/985623>
    _ucdbSvc.lookup(principal, aTables, aCallback);
  } catch(e) {
    try {
      _ucdbSvc.lookup(principal, aCallback);
    } catch(_e) {
      aCallback('');
    }
  }
}

var safeflag = {
  PHISH_LIST_TYPES: PHISH_LIST_TYPES,
  MALWARE_LIST_TYPES: MALWARE_LIST_TYPES,
  UNWANTED_LIST_TYPES: UNWANTED_LIST_TYPES,

  lookup: function(url, callback) {
    doLookup(url, LOOKUP_TABLE, (aTableNames) => {
      if (typeof callback == 'function') {
        nameArray = aTableNames.split(',');
        callback({
          isMalware: nameArray.some(t => { return MALWARE_LIST_TYPES.indexOf(t) > -1; }),
          isPhishing: nameArray.some(t => { return PHISH_LIST_TYPES.indexOf(t) > -1; }),
          isUnwanted: nameArray.some(t => { return UNWANTED_LIST_TYPES.indexOf(t) > -1; }),
          tableNames: aTableNames
        });
      }
    });
  },

  /* Invoke callback if one of the list types hits. */
  lookup_some: function(url, callback) {
    let lookupCount = 0;
    function lookupCallback(aTableNames) {
      lookupCount--;
      if (typeof callback != 'function') {
        return;
      }

      nameArray = aTableNames.split(',');
      let isMalware = nameArray.some(t => {
        return MALWARE_LIST_TYPES.indexOf(t) > -1;
      });

      let isPhishing = nameArray.some(t => {
        return PHISH_LIST_TYPES.indexOf(t) > -1;
      });

      let isUnwanted = nameArray.some(t => {
        return UNWANTED_LIST_TYPES.indexOf(t) > -1;
      });

      if (!isMalware && !isPhishing && !isUnwanted) {
        if (lookupCount == 0) {
          callback({
            isMalware: false,
            isPhishing: false,
            isUnwanted: false
          });
        }
        return;
      }

      let doCallback = callback;
      // Invalidate the following callbacks.
      callback = false;
      doCallback({
        isMalware: isMalware,
        isPhishing: isPhishing,
        isUnwanted: isUnwanted,
        tableNames: aTableNames
      });
    }

    ++lookupCount;
    ++lookupCount;
    doLookup(url, GOOG_LIST_TYPES.join(','), lookupCallback);
    doLookup(url, CN_PHISH_LIST_TYPES.join(','), lookupCallback);
  }
};

