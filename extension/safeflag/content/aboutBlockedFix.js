/* eslint-env mozilla/frame-script */
/* relevant excerpt from /browser/base/content/content.js
   with https://bugzil.la/1409348 backported */

const { interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "SafeBrowsing",
  "resource://gre/modules/SafeBrowsing.jsm");

function getSiteBlockedErrorDetails(docShell) {
  let blockedInfo = {};
  if (docShell.failedChannel) {
    let classifiedChannel = docShell.failedChannel.
                            QueryInterface(Ci.nsIClassifiedChannel);
    if (classifiedChannel) {
      let httpChannel = docShell.failedChannel.QueryInterface(Ci.nsIHttpChannel);

      let reportUri = httpChannel.URI.clone();

      if (reportUri instanceof Ci.nsIURL) {
        reportUri.query = "";
      }

      blockedInfo = { list: classifiedChannel.matchedList,
                      provider: classifiedChannel.matchedProvider,
                      uri: reportUri.asciiSpec };
    }
  }
  return blockedInfo;
}

var AboutBlockedSiteListener = {
  init(chromeGlobal) {
    chromeGlobal.addEventListener("AboutBlockedLoaded", this, false, true);

    this.handleEventForReal = this._handleEventForReal.bind(this);
  },

  get isBlockedSite() {
    return content.document.documentURI.startsWith("about:blocked");
  },

  handleEvent(aEvent) {
    content.setTimeout(this.handleEventForReal, 0, aEvent);
  },

  _handleEventForReal(aEvent) {
    if (!this.isBlockedSite) {
      return;
    }

    if (aEvent.type != "AboutBlockedLoaded") {
      return;
    }

    let blockedInfo = getSiteBlockedErrorDetails(docShell);

    let doc = content.document;

    switch (aEvent.detail.err) {
      case "malware":
        doc.getElementById("report_detection").setAttribute("href",
          (SafeBrowsing.getReportURL("MalwareMistake", blockedInfo) ||
           "https://www.stopbadware.org/firefox"));
        break;
      case "phishing":
        doc.getElementById("report_detection").setAttribute("href",
          (SafeBrowsing.getReportURL("PhishMistake", blockedInfo) ||
           "https://safebrowsing.google.com/safebrowsing/report_error/?tpl=mozilla"));
        break;
      default:
        break;
    }
  }
};

AboutBlockedSiteListener.init(this);
