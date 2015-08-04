/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(function() {
  var ns = MOA.ns('SafeFlag.Monitor')

  let windowMM = window.messageManager;

  let DEBUG = 0;
  function log(msg) {
    if (DEBUG) Cu.reportError('###### safeflagParent: ' + msg + '\n');
  }

  // Use directly import instead of lazy module getter intentionally.
  Cu.import('resource://cmsafeflag/CNSafeBrowsingRegister.jsm');

  let jsm = {};
  Cu.import("resource://gre/modules/XPCOMUtils.jsm");

  XPCOMUtils.defineLazyModuleGetter(jsm, 'safeflag',
    "resource://cmsafeflag/safeflag.jsm");

  function asyncGetClassifyResult() {
    let browserMM = gBrowser.selectedBrowser.messageManager;
    browserMM.sendAsyncMessage('SafeFlag::updateClassifyResult');
  }

  let progressListener = {
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIWebProgressListener,
                                          Ci.nsISupportsWeakReference]),
    onLocationChange: function(aWebProgress, aRequest, aLocation, aFlags) {
      asyncGetClassifyResult();
    }
  };

  function handleMessage(aEvent) {
    log('Got message: ' + JSON.stringify(aEvent.data) + ', isCurrent: ' + (gBrowser.selectedBrowser == aEvent.target));
    // Only update icon for current tab
    if (gBrowser.selectedBrowser == aEvent.target) {
       MOA.SafeFlag.Layout.updateIcon(aEvent.data);
    }
  }

  ns.init = function() {
    gBrowser.addProgressListener(progressListener);
    windowMM.addMessageListener('SafeFlag::updateClassifyResult', handleMessage);
    asyncGetClassifyResult();
  };

  ns.stop = function() {
    gBrowser.removeProgressListener(progressListener);
    windowMM.removeMessageListener('SafeFlag::updateClassifyResult', handleMessage);
  };

  let _onAboutBlocked = null;
  let _getReportURL = null;
  let _clickHandlerHacked = false;
  function hackClickHandler() {
    if (_clickHandlerHacked) return;
    _clickHandlerHacked = true;

    // Hack `BrowserOnClick` to navigate user to customized reportURL page.
    _onAboutBlocked = BrowserOnClick.onAboutBlocked.bind(BrowserOnClick);
    BrowserOnClick.onAboutBlocked = function(elementId, reasonOrIsMalware, isTopFrame, location) {
      // reasonOrIsMalware: for <https://bugzil.la/1147212>

      // The parameters are changed after <https://bugzil.la/989875> was landed,
      // for the sake of simplicity, let's just change the id of report button
      // back to `reportButton`, so it could be handled by the internal handler.
      if (elementId && elementId.id && elementId.id == 'cnReportButton') {
        elementId.id = 'reportButton';
      }

      _onAboutBlocked.apply(null, arguments);

      // Depending on what page we are displaying here (malware/phishing/unwanted)
      // use the right strings and links for each.
      let bucketName = "WARNING_PHISHING_PAGE_";
      if (reasonOrIsMalware === "malware" || reasonOrIsMalware === true) {
        bucketName = "WARNING_MALWARE_PAGE_";
      } else if (reasonOrIsMalware === "unwanted") {
        bucketName = "WARNING_UNWANTED_PAGE_";
      }
      let secHistogram = Services.telemetry.getHistogramById("SECURITY_UI");
      let nsISecTel = Ci.nsISecurityUITelemetry;
      bucketName += isTopFrame ? "TOP_" : "FRAME_";
      switch (elementId) {
        case 'cnReportButton':
          // This is the "Why is this site blocked" button.  For malware,
          // we can fetch a site-specific report, for phishing, we redirect
          // to the generic page describing phishing protection.

          // We log even if malware/phishing info URL couldn't be found:
          // the measurement is for how many users clicked the WHY BLOCKED button
          secHistogram.add(nsISecTel[bucketName + "WHY_BLOCKED"]);

          if (reasonOrIsMalware === true) {
            // Get the stop badware "why is this blocked" report url,
            // append the current url, and go there.
            try {
              let reportURL = formatURL("browser.safebrowsing.malware.reportURL", true);
              reportURL += location;
              gBrowser.loadURI(reportURL);
            } catch (e) {
              Components.utils.reportError("Couldn't get malware report URL: " + e);
            }
          } else if (reasonOrIsMalware === "phishing" || reasonOrIsMalware === false) { // It's a phishing site, not malware
            jsm.safeflag.lookup(location, function(aResult) {
              gBrowser.loadURI(
                Services.prefs.getCharPref('extensions.cpmanager.safeflag.reportURL').
                  replace('{LIST}', encodeURIComponent(aResult.tableNames)).
                  replace('{URL}', encodeURIComponent(location)));
            });
          } else {
            openHelpLink("phishing-malware", false, "current");
          }
          break;
      }
    };

    // Hack `gSafeBrowsing.getReportURL('Error')`
    _getReportURL = gSafeBrowsing.getReportURL.bind(gSafeBrowsing);
    gSafeBrowsing.getReportURL = function(aType) {
      if (aType == 'Error' &&
          Components.stack.caller.name == 'BrowserOnClick.ignoreWarningButton/buttons[1].callback') {
        var pageUri = gBrowser.currentURI.clone();
        // Remove the query to avoid including potentially sensitive data
        if (pageUri instanceof Ci.nsIURL)
          pageUri.query = '';

        jsm.safeflag.lookup(pageUri.asciiSpec, function(aResult) {
          openUILinkIn(Services.prefs.getCharPref('extensions.cpmanager.safeflag.reportURL').
                         replace('{LIST}', encodeURIComponent(aResult.tableNames)).
                         replace('{URL}', encodeURIComponent(pageUri.asciiSpec)),
                       'tab');
        });

        // Return an empty string, to stop the tab from opening.
        return "";
      }

      return _getReportURL.apply(null, arguments);
    };
  }

  window.addEventListener('load', function onload() {
    window.removeEventListener('load', onload);
    if (MOA.SafeFlag.Utils.getPrefs().getBoolPref("enable")) {
      ns.init();
    }

    window.setTimeout(function() {
      hackClickHandler();
      windowMM.loadFrameScript(
        'chrome://cmsafeflag/content/safeflagChild.js', true);
    }, 1000);
  });
})();

