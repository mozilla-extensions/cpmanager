this.EXPORTED_SYMBOLS = ["ceClearHistory"];

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PlacesUtils",
  "resource://gre/modules/PlacesUtils.jsm");

this.ceClearHistory = {
  prefKey: "extensions.cpmanager@mozillaonline.com.sanitize.timeout",
  topic: "privacy-pane-loaded",
  get strings() {
    let spec = "chrome://cmimprove/locale/sanitize.properties";
    delete this.strings;
    return this.strings = Services.strings.createBundle(spec);
  },

  _(key) {
    return this.strings.GetStringFromName(key);
  },

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
     let promise = ceClearHistory.
       clearHistoryAsync({ progress }).
       catch(ex => console.error(ex));
   */
  clearHistoryAsync(options) {
    let self = this;
    return new Promise(function(resolve, reject) {
      let prefKey = "privacy.sanitize.sanitizeOnShutdown";
      if (Services.prefs.getBoolPref(prefKey, false)) {
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
      return promise;
    });
  },

  getDaysToClear() {
    let option = Services.prefs.getIntPref(this.prefKey, 0);
    return {
      "-1": 1,
      "-2": 7,
      "-3": 30,
      "-4": 90,
      "-6": 365
    }[option] || option;
  },

  getRangeByDays(days) {
    return [0, (Date.now() - days * 86400e3) * 1e3];
  },

  init() {
    let progress = {};
    this.condition = () => this.clearHistoryAsync({ progress });

    // 0/disable, -1/daily, -2/weekly, -3/monthly, -4/quarterly, -6/yearly
    Services.prefs.getDefaultBranch("").setIntPref(this.prefKey, -4);
    PlacesUtils.history.shutdownClient.jsclient.addBlocker("ceClearHistory",
      this.condition,
      {
        fetchState() {
          return { progress };
        }
      }
    );
    Services.obs.addObserver(this, this.topic);
  },

  observe(subject, topic, data) {
    if (topic !== this.topic) {
      return;
    }

    let doc = subject.document;
    // Since Fx 59, https://bugzil.la/1379338
    let prefs = doc.getElementById("privacyPreferences");
    let id = this.prefKey;
    let type = "int";
    if (!prefs) {
      subject.Preferences.addAll([
        { id, type }
      ]);
    } else {
      let pref = doc.createElement("preference");
      pref.id = id;
      pref.setAttribute("name", id);
      pref.setAttribute("type", "int");
      prefs.appendChild(pref);
    }

    let historyRememberPane = doc.getElementById("historyRememberPane");
    let hbox = doc.createElement("hbox");
    hbox.setAttribute("align", "center");
    hbox.setAttribute("flex", "1");

    let menulist = doc.createElement("menulist");
    menulist.id = "mococnAutoClearHistory";
    menulist.setAttribute("preference", id);

    let menupopup = doc.createElement("menupopup");
    let options = [
      ["0", "none"],
      ["-1", "daily"],
      ["-2", "weekly"],
      ["-3", "monthly"],
      ["-4", "quarterly"],
      ["-6", "yearly"]
    ];
    for (let [v, l] of options) {
      let menuitem = doc.createElement("menuitem");
      menuitem.setAttribute("value", v);
      menuitem.setAttribute("label", this._(`cp.clearRecentHistory.${l}.label`));
      menupopup.appendChild(menuitem);
    }

    let label = doc.createElement("label");
    label.setAttribute("value", this._("cp.clearHistory.label"));
    label.setAttribute("control", menulist.id);
    label.setAttribute("accesskey", this._("cp.clearHistory.accesskey"));

    menulist.appendChild(menupopup);
    hbox.appendChild(label);
    hbox.appendChild(menulist);
    historyRememberPane.appendChild(hbox);
  },

  uninit(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }

    PlacesUtils.history.shutdownClient.jsclient.removeBlocker(this.condition);
    Services.obs.removeObserver(this, this.topic);
  }
}
