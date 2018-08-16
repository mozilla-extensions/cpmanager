(async function() {
  const DEBUG = false;
  const DEFAULT_DAYS_TO_KEEP = 91;
  const DAYS_KEY = "clearHistory.days";
  const ENABLED_KEY = "clearHistory.enabled";
  const LEGACY_PREF_KEY = "extensions.cpmanager@mozillaonline.com.sanitize.timeout";
  const LEGACY_PREF_TO_DAYS = {
    "0": 0,
    "-1": 1,
    "-2": 7,
    "-3": 30,
    "-4": DEFAULT_DAYS_TO_KEEP,
    "-6": 365
  };

  async function getDaysToKeep() {
    let {
      [DAYS_KEY]: daysToKeep,
      [ENABLED_KEY]: enabled
    } = await browser.storage.local.get([DAYS_KEY, ENABLED_KEY]);

    if (enabled !== undefined) {
      return enabled ? DEFAULT_DAYS_TO_KEEP : 0;
    }
    if (DEBUG) {
      console.log(`"${ENABLED_KEY}" missing from storage.local`);
    }

    let {
      [LEGACY_PREF_KEY]: legacyPrefVal
    } = await browser.mozillaonline.chinaPackManager.sendLegacyMessage({
      dir: "bg2legacy",
      type: "migratePrefs",
      prefKeys: [LEGACY_PREF_KEY]
    });
    if (DEBUG) {
      console.log(`"${LEGACY_PREF_KEY}" is ${legacyPrefVal}`);
    }

    daysToKeep = LEGACY_PREF_TO_DAYS[legacyPrefVal] || legacyPrefVal;

    if (isNaN(daysToKeep) || daysToKeep < 0) {
      daysToKeep = DEFAULT_DAYS_TO_KEEP;
      enabled = true;
    } else if (daysToKeep === 0) {
      daysToKeep = DEFAULT_DAYS_TO_KEEP;
      enabled = false;
    } else {
      enabled = daysToKeep <= DEFAULT_DAYS_TO_KEEP;
    }
    if (DEBUG) {
      console.log(`Initial value of ${DAYS_KEY} is ${daysToKeep}`);
      console.log(`Initial value of ${ENABLED_KEY} is ${enabled}`);
    }

    await browser.storage.local.set({
      [DAYS_KEY]: daysToKeep,
      [ENABLED_KEY]: enabled
    });
    return enabled ? DEFAULT_DAYS_TO_KEEP : 0;
  }

  async function handleIdleStateChanged(idleState) {
    if (DEBUG) {
      console.log(`Idle state changed to ${idleState}`);
    }

    if (!["idle", "locked"].includes(idleState)) {
      return;
    }

    let daysToKeep = await getDaysToKeep();
    if (!daysToKeep) {
      return;
    }
    if (DEBUG) {
      console.log(`Only keep ${daysToKeep} days of history`);
    }

    browser.history.deleteRange({
      startTime: 0,
      endTime: Date.now() - daysToKeep * 86400e3
    });
  }

  // 3m, like https://addons.mozilla.org/firefox/addon/expire-history-by-days/
  browser.idle.setDetectionInterval(180);
  browser.idle.onStateChanged.addListener(handleIdleStateChanged);
})();
