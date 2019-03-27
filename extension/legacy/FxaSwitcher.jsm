/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["FxaSwitcher"];

ChromeUtils.defineModuleGetter(this, "XPCOMUtils",
  "resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  "fxAccounts": "resource://gre/modules/FxAccounts.jsm", /* global fxAccounts */
  "FxAccountsConfig": "resource://gre/modules/FxAccountsConfig.jsm", /* global FxAccountsConfig */
  "Services": "resource://gre/modules/Services.jsm" /* global Services */
});
XPCOMUtils.defineLazyGetter(this, "CETracking", () => {
  return Cc["@mozilla.com.cn/tracking;1"].getService().wrappedJSObject;
});

const AUTO_CONFIG_KEY = "identity.fxaccounts.autoconfig.uri";
const AUTO_CONFIG_VAL = "https://accounts.firefox.com.cn";
const FXA_PREF_KEY = "identity.fxaccounts.auth.uri";
const FXA_PREF_VAL = "https://api-accounts.firefox.com.cn/v1";
const INIT_STEP_KEY = "extensions.cpmanager@mozillaonline.com.fxa.initstep";
const ONE_CHECK_PREF = "cpmanager@mozillaonline.com.switch_fxa_pref.checked";

let FxaSwitcher = {
  topic: "sync-pane-loaded",

  get initStep() {
    if (Services.prefs.getPrefType(INIT_STEP_KEY) === Services.prefs.PREF_INT) {
      return Services.prefs.getIntPref(INIT_STEP_KEY, 0);
    }

    return Services.prefs.getBoolPref(ONE_CHECK_PREF, false) ? 1 : 0;
  },

  set initStep(val) {
    Services.prefs.setIntPref(INIT_STEP_KEY, val);
  },

  get useLocalSvc() {
    return FxAccountsConfig.getAutoConfigURL() === AUTO_CONFIG_VAL;
  },

  _(key, args) {
    key = key.replace("fxa.", "FxaSwitcher.");
    return this._strings ? this._strings._(key, args) : "";
  },

  handleEvent(evt) {
    switch (evt.type) {
      case "click":
        this.switchService(evt);
        break;
      default:
        break;
    }
  },

  async init(strings) {
    this._strings = strings;

    Services.obs.addObserver(this, this.topic);

    let isSignedIn = !!(await fxAccounts.getSignedInUser());

    switch (this.initStep) {
      case 0:
        if (!isSignedIn) {
          this.switchToLocal();
          this.onlySyncBookmark();
        }
        // intentionally no break
      case 1:
        if (Services.prefs.getCharPref(FXA_PREF_KEY) === FXA_PREF_VAL) {
          // backfill AUTO_CONFIG_KEY based on FXA_PREF_KEY
          this.switchToLocal();
        }
        break;
      // remove 2=>3 backfill and the break above when a step 4 is added
      case 2:
        FxAccountsConfig.ensureConfigured();
        break;
      default:
        break;
    }

    this.initStep = 3;
  },

  observe(subject, topic, data) {
    if (topic !== this.topic) {
      return;
    }

    let self = this;
    subject.mozCNSyncHack = {
      onSyncToEnablePref(checkbox) {
        if (checkbox.checked) {
          return undefined;
        }

        let p = Services.prompt;
        let shouldDisable = p.confirmEx(checkbox.ownerGlobal,
          self._("fxa.preferences.warning.title"),
          self._("fxa.preferences.warning.message", [checkbox.label]),
          p.STD_YES_NO_BUTTONS + p.BUTTON_POS_1_DEFAULT + p.BUTTON_DELAY_ENABLE,
          "", "", "", null, {}) === 0;

        if (!shouldDisable) {
          checkbox.checked = true;
        }
        return undefined;
      }
    };

    let doc = subject.document;

    let noFxaAccount = doc.getElementById("noFxaAccount");
    let label = doc.createElement("label");
    label.id = "mococnFxaSwitcher";
    label.classList.add("text-link");
    label.addEventListener("click", this);
    noFxaAccount.appendChild(label);
    if (label.previousSibling.className == "fxaMobilePromo") {
      let marginOtherSide = parseInt(subject.
        getComputedStyle(label.previousSibling).marginBottom, 10);
      label.style.setProperty("margin-top",
        `${32 - marginOtherSide}px`, "important");
    }
    this.updateStrings(doc);

    // for https://bugzil.la/1182397
    let selector = 'checkbox[preference^="engine."]';
    [].filter.call(doc.querySelectorAll(selector), checkbox => {
      return subject.Preferences.get(checkbox.getAttribute("preference")).
        name.startsWith("services.sync.engine.");
    }).forEach(checkbox => {
      if (checkbox.hasAttribute("onsynctopreference")) {
        return;
      }

      checkbox.setAttribute("onsynctopreference",
        "return mozCNSyncHack.onSyncToEnablePref(this);");
    });
  },

  onlySyncBookmark() {
    // What about new engines like addresses, creditcards etc.?
    let toDecline = ["addons", "history", "passwords", "prefs", "tabs"];

    toDecline.forEach(aKey => {
      Services.prefs.setBoolPref("services.sync.engine." + aKey, false);
    });
    toDecline = toDecline.join(",");
    Services.prefs.setCharPref("services.sync.declinedEngines", toDecline);
  },

  switchService(evt) {
    let action = this.useLocalSvc ? "switchToGlobal" : "switchToLocal";

    let title = this._(`fxa.confirm.title.switchService`);
    let body = this._(`fxa.confirm.body.${action}`);
    if (!Services.prompt.confirm(null, title, body)) {
      return;
    }

    this[action]();

    this.updateStrings(evt.target.ownerDocument);

    let url = `http://addons.g-fox.cn/fxa-switch.gif?fxa=${this.useLocalSvc}`;
    CETracking.send(url);
  },

  switchToGlobal() {
    // Set the pref to ensure resetConfigURLs works
    Services.prefs.setCharPref(AUTO_CONFIG_KEY, AUTO_CONFIG_VAL);
    FxAccountsConfig.resetConfigURLs();
    Services.prefs.clearUserPref(AUTO_CONFIG_KEY);
  },

  switchToLocal() {
    Services.prefs.setCharPref(AUTO_CONFIG_KEY, AUTO_CONFIG_VAL);
    FxAccountsConfig.ensureConfigured();
  },

  uninit() {
    Services.obs.removeObserver(this, this.topic);

    delete this._strings;
  },

  updateStrings(doc) {
    let useLocalSvc = this.useLocalSvc;

    let action = useLocalSvc ? "switchToGlobal" : "switchToLocal";
    let actionText = this._(`fxa.preferences.action.${action}`);
    doc.getElementById("mococnFxaSwitcher").setAttribute("value", actionText);

    let brand = useLocalSvc ? "local" : "global";
    let brandText = this._(`fxa.preferences.brand.${brand}`);

    // Since Fx 65, see https://bugzil.la/1429940,1507806
    [
      "#category-sync > .category-name",
      "#firefoxAccountCategory > h1, #firefoxAccountCategory > .header-name",
      "#fxaGroup > .search-header > h2, #fxaGroup > .search-header > label"
    ].forEach(selector => {
      doc.querySelector(selector).textContent = brandText;
    });

    [
      "#category-sync"
    ].forEach(selector => {
      doc.querySelector(selector).tooltipText = brandText;
    });
  }
};
