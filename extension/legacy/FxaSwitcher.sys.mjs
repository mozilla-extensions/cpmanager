/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  FxAccountsConfig: "resource://gre/modules/FxAccountsConfig.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "fxAccounts", () => {
  return ChromeUtils.importESModule(
    "resource://gre/modules/FxAccounts.sys.mjs"
  ).getFxAccountsSingleton();
});

const AUTO_CONFIG_KEY = "identity.fxaccounts.autoconfig.uri";
const AUTO_CONFIG_VAL = "https://accounts.firefox.com.cn";
const FXA_PREF_KEY = "identity.fxaccounts.auth.uri";
const FXA_PREF_VAL = "https://api-accounts.firefox.com.cn/v1";
const INIT_STEP_KEY = "extensions.cpmanager@mozillaonline.com.fxa.initstep";
const ONE_CHECK_PREF = "cpmanager@mozillaonline.com.switch_fxa_pref.checked";
const PAIRING_PREF_KEY = "identity.fxaccounts.remote.pairing.uri";
const PAIRING_PREF_VAL = "wss://channelserver.firefox.com.cn";
const SYNC_PREF_KEY = "identity.sync.tokenserver.uri";
const SYNC_PREF_VAL = "https://sync.firefox.com.cn/token/1.0/sync/1.5";

export let FxaSwitcher = {
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
    return lazy.FxAccountsConfig.getAutoConfigURL() === AUTO_CONFIG_VAL;
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

    let refreshStatus = "NA";
    let isSignedIn = !!(await lazy.fxAccounts.getSignedInUser());

    let initStep = this.initStep;
    switch (initStep) {
      case 0:
        if (!isSignedIn) {
          this.switchToLocal();
        }
        // intentionally no break
      case 1:
        if (Services.prefs.getCharPref(FXA_PREF_KEY, "") === FXA_PREF_VAL) {
          // backfill AUTO_CONFIG_KEY based on FXA_PREF_KEY
          this.switchToLocal();
        }
        break;
      // remove 2=>3 & 3=>4 backfill and the break above when a step 5 is added
      case 2:
        lazy.FxAccountsConfig.ensureConfigured();
        break;
      case 3:
        refreshStatus = await this.refreshPairingUri();
        break;
      default:
        break;
    }

    const currentStep = 4;
    if (initStep >= currentStep) {
      return;
    }
    this.initStep = currentStep;
  },

  observe(subject, topic, data) {
    if (topic !== this.topic) {
      return;
    }

    let doc = subject.document;

    let noFxaAccount = doc.getElementById("noFxaAccount");
    let label = doc.createXULElement("label");
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
  },

  async refreshPairingUri() {
    // Only refresh for those using local FxA service
    if (Services.prefs.getCharPref(FXA_PREF_KEY, "") !== FXA_PREF_VAL) {
      return "notLocal";
    }
    // Only refresh for those w/o correct pairing url
    if (Services.prefs.getCharPref(PAIRING_PREF_KEY, "") === PAIRING_PREF_VAL) {
      return "localPairing";
    }
    // Don't run `fetchConfigURLs` for those using alternative token.
    if (Services.prefs.getCharPref(SYNC_PREF_KEY, "") !== SYNC_PREF_VAL) {
      return "altToken";
    }

    await lazy.FxAccountsConfig.fetchConfigURLs();
    return "refreshed";
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
  },

  switchToGlobal() {
    // Set the pref to ensure resetConfigURLs works
    Services.prefs.setCharPref(AUTO_CONFIG_KEY, AUTO_CONFIG_VAL);
    lazy.FxAccountsConfig.resetConfigURLs();
    Services.prefs.clearUserPref(AUTO_CONFIG_KEY);
  },

  switchToLocal() {
    Services.prefs.setCharPref(AUTO_CONFIG_KEY, AUTO_CONFIG_VAL);
    lazy.FxAccountsConfig.ensureConfigured();
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
  },
};
