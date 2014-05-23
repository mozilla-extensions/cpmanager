/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let EXPORTED_SYMBOLS = ['FxaSwitcher'];

const Ci = Components.interfaces;
const Cu = Components.utils;
const Cc = Components.classes;

let TOKEN_SERVER     = 'https://sync.firefox.com.cn';
let AUTH_SERVER      = 'https://api-accounts.firefox.com.cn';
let ACCOUNTS_SERVER  = 'https://accounts.firefox.com.cn';

const DEBUG = 0;
if (0) {
  TOKEN_SERVER       = 'https://sync.testfirefox.com.cn';
  AUTH_SERVER        = 'https://api-accounts.testfirefox.com.cn';
  ACCOUNTS_SERVER    = 'https://accounts.testfirefox.com.cn';
}

const TOKEN_SERVER_URI = TOKEN_SERVER    + '/token/1.0/sync/1.5';
const AUTH_URI         = AUTH_SERVER     + '/v1';
const FORCE_AUTH_URI   = ACCOUNTS_SERVER + '/force_auth?service=sync&context=fx_desktop_v1';
const SIGHIN_URI       = ACCOUNTS_SERVER + '/signin?service=sync&context=fx_desktop_v1';
const SIGHUP_URI       = ACCOUNTS_SERVER + '/signup?service=sync&context=fx_desktop_v1';
const REMOTE_URI       = ACCOUNTS_SERVER + '/?service=sync&context=fx_desktop_v1';
const SETTINGS_URI     = ACCOUNTS_SERVER + '/settings';
const PRIVACY_URL      = ACCOUNTS_SERVER + '/legal/privacy';
const TERMS_URL        = ACCOUNTS_SERVER + '/legal/terms';

const PREF_SYNC_TOKENSERVER = 'services.sync.tokenServerURI';

const SERVICE_PREFS = {
  'services.sync.tokenServerURI': TOKEN_SERVER_URI,
  'identity.fxaccounts.auth.uri': AUTH_URI,
  'identity.fxaccounts.remote.force_auth.uri': FORCE_AUTH_URI,
  'identity.fxaccounts.remote.signin.uri': SIGHIN_URI,
  'identity.fxaccounts.remote.signup.uri': SIGHUP_URI,
  'identity.fxaccounts.remote.uri': REMOTE_URI,
  'identity.fxaccounts.settings.uri': SETTINGS_URI,
  'services.sync.fxa.privacyURL': PRIVACY_URL,
  'services.sync.fxa.termsURL': TERMS_URL,
  'services.sync.fxaccounts.enabled': true
};

const UT_NO_SYNC_USED    = 'ut_no_sync_used';
const UT_FXA_USED        = 'ut_fxaccount_used';
const UT_WEAVE_USED      = 'ut_weave_used';
const UT_CN_FXA_SWITCHED = 'ut_cn_fxa_switched';
const ONE_CHECK_PREF = 'cpmanager@mozillaonline.com.switch_fxa_pref.checked';

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this,
  'Weave', 'resource://services-sync/main.js');

XPCOMUtils.defineLazyModuleGetter(this,
  'fxAccounts', 'resource://gre/modules/FxAccounts.jsm');

XPCOMUtils.defineLazyModuleGetter(this,
  'Promise', 'resource://gre/modules/Promise.jsm');

XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");

let _bundles = null;
function _(key) {
  if (!_bundles) {
    _bundles = Services.strings.createBundle("chrome://cmimprove/locale/fxa.properties");
  }

  return _bundles.GetStringFromName(key);
}

function localServiceEnabled() {
  return Services.prefs.getCharPref(PREF_SYNC_TOKENSERVER) ==
           TOKEN_SERVER_URI;
}

function isAuthURILocal() {
  return Services.prefs.getCharPref('identity.fxaccounts.auth.uri') ==
           AUTH_URI;
}

PrefWatchDog = {
  observe: function(aSubject, aTopic, aData) {
    if (aTopic != "nsPref:changed") {
      return;
    }

    if (aData == PREF_SYNC_TOKENSERVER) {
      // Check if PREF_SYNC_TOKENSERVER is reset and other prefs
      // stay as local entries, if yes, it should be reset by FF when
      // user signed out, let's change it back.
      if (!Services.prefs.prefHasUserValue(PREF_SYNC_TOKENSERVER) &&
          isAuthURILocal()) {
        debug('change it back.');

        if (localServiceEnabled()) {
          resetFxaServices();
        } else {
          switchToLocalService();
        }
      }
    }
  }
};

/**
 * services.sync.tokenServerURI is reset after user disconnected, we need to
 * change it back.
 */
function startPrefWatchDog() {
  debug('Add pref watch dog');
  Services.prefs.addObserver('services.sync.tokenServerURI',
    PrefWatchDog, false);
}

function stopPrefWatchDog() {
  debug('Remove pref watch dog');
  Services.prefs.removeObserver('services.sync.tokenServerURI',
    PrefWatchDog, false);
}

function debug(msg) {
  if (DEBUG) {
    Cu.reportError('CP:FXA: ' + msg);
  }
}

/**
 * Get the account service usage type of current profile. One of the
 * const values with prefix UT_* is returned.
 */
function getUsageType() {
  let { promise, resolve } = Promise.defer()

  if (localServiceEnabled()) {
    resolve(UT_CN_FXA_SWITCHED);
    return promise;
  }

  // Borrow some codes from chrome://browser/content/preferences/sync.js
  let service = Cc["@mozilla.org/weave/service;1"]
                  .getService(Ci.nsISupports)
                  .wrappedJSObject;

  debug('Weave status: ' + Weave.Status);

  // If fxAccountsEnabled is false, fxa is in a "not configured" state.
  if (service.fxAccountsEnabled) {
    fxAccounts.getSignedInUser().then(function(data) {
      if (data) {
        debug('Fxa data: ' + JSON.stringify(data));
        resolve(UT_FXA_USED);
      } else {
        resolve(UT_NO_SYNC_USED);
      }
    });
  } else if (typeof Weave == 'undefined') {
    // No Weave object.
    resolve(UT_NO_SYNC_USED);
  } else if (Weave.Status.service == Weave.CLIENT_NOT_CONFIGURED ||
             Weave.Svc.Prefs.get("firstSync", "") == "notReady") {
    // No Weave accounts.
    resolve(UT_NO_SYNC_USED);
  } else if (Weave.Status.login == Weave.LOGIN_FAILED_INVALID_PASSPHRASE ||
             Weave.Status.login == Weave.LOGIN_FAILED_LOGIN_REJECTED) {
    // Weave login failed.
    resolve(UT_WEAVE_USED);
  } else {
    resolve(UT_WEAVE_USED);
  }

  return promise;
}

function resetFxaServices() {
  if (!localServiceEnabled()) {
    return;
  }

  stopPrefWatchDog();
  Object.keys(SERVICE_PREFS).forEach(function(key) {
    Services.prefs.clearUserPref(key);
  });
  startPrefWatchDog();
}

function switchToLocalService() {
  if (localServiceEnabled()) {
    return;
  }

  stopPrefWatchDog();
  Object.keys(SERVICE_PREFS).forEach(function(key) {
    if (typeof SERVICE_PREFS[key] == 'string') {
      Services.prefs.setCharPref(key, SERVICE_PREFS[key]);
    } else if (typeof SERVICE_PREFS[key] == 'boolean') {
      Services.prefs.setBoolPref(key, SERVICE_PREFS[key]);
    }
  });
  startPrefWatchDog();
}

function alreadyChecked() {
  try {
    return Services.prefs.getBoolPref(ONE_CHECK_PREF, false);
  } catch (e) {
    return false;
  }
}

function markChecked() {
  Services.prefs.setBoolPref(ONE_CHECK_PREF, true);
}

function init() {
  initPageMod();

  if (alreadyChecked()) {
    startPrefWatchDog();
    done();
    return;
  }

  getUsageType().then(aType => {
    debug('user type: ' + aType + '\n');
    switch(aType) {
      case UT_NO_SYNC_USED:
      case UT_WEAVE_USED:
        switchToLocalService();
        break;
      default:
        debug('Ignore for ' + aType);
        break;
    }
  }).then(() => {
    debug('Switch prefs done.');
    startPrefWatchDog();
    markChecked();
    done();
  }, e => {
    debug('error: ' + e);
    done();
  });
}

let statusListener = [];
let isDone = false;

function done() {
  isDone = true;
  statusListener.forEach(callback => {
    try {
      callback();
    } catch (e) {}
  });
}

let FxaSwitcher = {
  /**
   * This along with addStatusListener/removeStatusListener are used by passport addon,
   * in case we didn't finish fxa entries checking/switching before passport addon
   * start migration process.
   */
  get isDone() {
    return isDone;
  },

  get localServiceEnabled() {
    return localServiceEnabled();
  },

  addStatusListener: function(listener) {
    if (statusListener.indexOf(listener) > -1) {
      return;
    } else {
      statusListener.push(listener);
    }
  },

  removeStatusListener: function(listener) {
    let index = statusListener.indexOf(listener);
    if (index > -1) {
      statusListener.splice(index, 1);
    }
  },

  resetFxaServices: function() {
    let title = _('fxa.confirm.title.switchToGlobal');
    let body = _('fxa.confirm.body.switchToGlobal');
    if (Services.prompt.confirm(null, title, body)) {
      resetFxaServices();
      Cc['@mozilla.org/toolkit/app-startup;1'].getService(Ci.nsIAppStartup)
        .quit(Ci.nsIAppStartup.eForceQuit | Ci.nsIAppStartup.eRestart);
    }
  },

  switchToLocalService: function() {
    let title = _('fxa.confirm.title.switchToLocal');
    let body = _('fxa.confirm.body.switchToLocal');
    if (Services.prompt.confirm(null, title, body)) {
      switchToLocalService();

      // Restart anyway.
      Cc['@mozilla.org/toolkit/app-startup;1'].getService(Ci.nsIAppStartup)
        .quit(Ci.nsIAppStartup.eForceQuit | Ci.nsIAppStartup.eRestart);
    }
  }
};

let { PageMod }= Cu.import("resource://gre/modules/devtools/Loader.jsm").
                   devtools.require("sdk/page-mod");

let l10nKeys = [
  'fxa.confirm.title.switchToLocal',
  'fxa.confirm.body.switchToLocal',
  'fxa.confirm.title.switchToGlobal',
  'fxa.confirm.body.switchToGlobal',
  'fxa.page.tooltip.localServices',
  'fxa.page.toggler.switchToLocal',
  'fxa.page.toggler.switchToGlobal',
  'fxa.page.flag.global',
  'fxa.page.flag.local'
];

function initPageMod() {
  let l10nValues = {};
  l10nKeys.forEach(function(key) {
    l10nValues[key] = _(key);
  });

  let l10nScript = 'var l10n = ' + JSON.stringify(l10nValues) + ';';

  PageMod({
    include: /about:accounts([#?].*)?$/,
    contentScriptFile: 'resource://cmimprove-fxa/injectScript.js',
    contentScript: l10nScript,
    contentStyleFile: 'resource://cmimprove-fxa/injectStyle.css',
    contentScriptWhen: 'start',
    onAttach: function(worker) {
      debug('Attach pageMod!!');
      function handleMessage(data) {
        switch (data.message) {
          case 'localServiceEnabled':
            worker.port.emit('message', {
              enabled: FxaSwitcher.localServiceEnabled,
              _rid_: data._rid_
            });
            break;
          case 'resetFxaServices':
            FxaSwitcher.resetFxaServices();
            worker.port.emit('message', {
              _rid_: data._rid_
            });
            break;
          case 'switchToLocalService':
            FxaSwitcher.switchToLocalService();
            worker.port.emit('message', {
              _rid_: data._rid_
            });
            break;
        }
      }

      worker.port.on('message', handleMessage);
    }
  });

  debug('Init cpmanager fxa improve');
}

init();

