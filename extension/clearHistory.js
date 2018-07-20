(async function() {
  const DEBUG = false;
  const DEFAULT_DAYS_TO_CLEAR = 90;
  const DAYS_KEY = "clearHistory.days";
  const ENABLED_KEY = "clearHistory.enabled";
  const LEGACY_PREF_KEY = "extensions.cpmanager@mozillaonline.com.sanitize.timeout";
  const LEGACY_PREF_TO_DAYS = {
    "0": 0,
    "-1": 1,
    "-2": 7,
    "-3": 30,
    "-4": 90,
    "-6": 365
  };

  async function getDaysToClear() {
    let {
      [DAYS_KEY]: daysToClear,
      [ENABLED_KEY]: enabled
    } = await browser.storage.local.get([DAYS_KEY, ENABLED_KEY]);

    if (enabled !== undefined) {
      return enabled ? Math.max(daysToClear, DEFAULT_DAYS_TO_CLEAR) : 0;
    }
    if (DEBUG) {
      console.log(`"${DAYS_KEY}" missing from storage.local`);
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

    daysToClear = LEGACY_PREF_TO_DAYS[legacyPrefVal] || legacyPrefVal;
    enabled = true;

    if (isNaN(daysToClear) || daysToClear < 0) {
      daysToClear = DEFAULT_DAYS_TO_CLEAR;
    } else if (daysToClear === 0) {
      daysToClear = DEFAULT_DAYS_TO_CLEAR;
      enabled = false;
    }
    if (DEBUG) {
      console.log(`Initial value of ${DAYS_KEY} is ${daysToClear}`);
      console.log(`Initial value of ${ENABLED_KEY} is ${enabled}`);
    }

    await browser.storage.local.set({
      [DAYS_KEY]: daysToClear,
      [ENABLED_KEY]: enabled
    });
    return enabled ? Math.max(daysToClear, DEFAULT_DAYS_TO_CLEAR) : 0;
  }

  async function handleIdleStateChanged(idleState) {
    if (DEBUG) {
      console.log(`Idle state changed to ${idleState}`);
    }

    if (!["idle", "locked"].includes(idleState)) {
      return;
    }

    let daysToClear = await getDaysToClear();
    if (!daysToClear) {
      return;
    }
    if (DEBUG) {
      console.log(`Only keep ${daysToClear} days of history`);
    }

    browser.history.deleteRange({
      startTime: 0,
      endTime: Date.now() - daysToClear * 86400e3
    });
  }

  // 3m, like https://addons.mozilla.org/firefox/addon/expire-history-by-days/
  browser.idle.setDetectionInterval(180);
  browser.idle.onStateChanged.addListener(handleIdleStateChanged);
})();
