const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const _CID = Components.ID('{44FA5595-2842-6F60-1385-B6C7AC6F118B}');
const _CONTRACTID = "@mozilla.com.cn/clearHistory;1";

XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Preferences",
  "resource://gre/modules/Preferences.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PlacesUtils",
  "resource://gre/modules/PlacesUtils.jsm");
XPCOMUtils.defineLazyServiceGetter(this, "PlacesDB",
  "@mozilla.org/browser/nav-history-service;1", "nsPIPlacesDatabase");

function chFactoryClass() {
  this.wrappedJSObject = this;
}

chFactoryClass.prototype = {
  classDescription: "Clear History On Close Firefox",
  contractID: _CONTRACTID,
  classID: _CID,
  _xpcom_categories: [{ category: "profile-after-change" }],
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  clearHistoryByBrowser: "privacy.sanitize.sanitizeOnShutdown",

  /*
   * For test:
     let progress = {
       _history: "uninitialized",
       get history() {
         return this._history;
       },
       set history(val) {
         console.log("settings progress.history to " + val);
         this._history = val;
       }
     };
     let promise = Cc["@mozilla.com.cn/clearHistory;1"].
       getService(Ci.nsISupports).wrappedJSObject.
       clearHistoryAsync({ progress }).catch(function(ex) {
         console.error(ex);
       });
   */
  clearHistoryAsync: function(options) {
    let self = this;
    return new Promise(function(resolve, reject) {
      if (Preferences.get(self.clearHistoryByBrowser, false)) {
        return resolve();
      }

      let progress = options.progress;
      progress.history = "ready";

      let days = self.getDaysToClear();
      if (!days) {
        progress.history = "skipped";
        return resolve();
      }
      
      let range = self.getRangeByDays(days);
      let promise = PlacesUtils.history.removeVisitsByFilter({
        beginDate: new Date(range[0] / 1000),
        endDate: new Date(range[1] / 1000)
      }).then(function() {
        progress.history = "cleared";
        resolve();
      }, function(ex) {
        progress.history = "failed";
        reject(ex);
      });
      progress.history = "blocking";
    });
  },

  clearHistorySync: function() {
    if (Preferences.get(this.clearHistoryByBrowser, false)) {
      return;
    }

    let days = this.getDaysToClear();
    if (!days) {
      return;
    }

    let range = this.getRangeByDays(days);
    PlacesUtils.history.QueryInterface(Ci.nsIBrowserHistory).
      removeVisitsByTimeframe(range[0], range[1]);
  },

  getDaysToClear: function() {
    let prefKey = "extensions.cpmanager@mozillaonline.com.sanitize.timeout";
    let option = Preferences.get(prefKey, 0);
    return days = {
      "-1": 1,
      "-2": 7,
      "-3": 30,
      "-4": 90,
      "-6": 365
    }[option] || option;
  },

  getRangeByDays: function(days) {
    return [0, (Date.now() - days * 86400e3) * 1e3];
  },

  observe: function (aSubject, aTopic, aData) {
    switch (aTopic) {
      case "profile-after-change":
        if (PlacesUtils.history.removeVisitsByTimeframe) {
          Services.obs.addObserver(this, "quit-application", true);
          break;
        }

        let progress = {};
        let self = this;
        PlacesDB.shutdownClient.jsclient.addBlocker("ceClearHistory",
          function() {
            return self.clearHistoryAsync({ progress });
          },
          {
            fetchState: function() {
              return { progress };
            }
          }
        );
        break;
      case "quit-application":
        this.clearHistorySync();
        break;
    };
  }
}

const NSGetFactory = XPCOMUtils.generateNSGetFactory([chFactoryClass]);
