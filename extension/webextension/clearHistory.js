(async function() {
  const DEBUG = false;
  const DEFAULT_DAYS_TO_CLEAR = 90;
  const LEGACY_PREF_KEY = "extensions.cpmanager@mozillaonline.com.sanitize.timeout";
  const LEGACY_PREF_TO_DAYS = {
    "0": 0,
    "-1": 1,
    "-2": 7,
    "-3": 30,
    "-4": 90,
    "-6": 365
  };
  const STORAGE_KEY = "clearHistory.days";

  async function getDaysToClear() {
    let {
      [STORAGE_KEY]: daysToClear
    } = await browser.storage.local.get(STORAGE_KEY);

    if (daysToClear) {
      return daysToClear;
    }
    if (DEBUG) {
      console.log(`"${STORAGE_KEY}" missing from storage.local`);
    }

    let {
      [LEGACY_PREF_KEY]: legacyPrefVal
    } = await browser.runtime.sendMessage({
      dir: "bg2legacy",
      type: "migratePrefs",
      prefKeys: [LEGACY_PREF_KEY]
    });
    if (DEBUG) {
      console.log(`"${LEGACY_PREF_KEY}" is ${legacyPrefVal}`);
    }

    daysToClear = LEGACY_PREF_TO_DAYS[legacyPrefVal] || legacyPrefVal;
    if (isNaN(daysToClear) || daysToClear < 0) {
      daysToClear = DEFAULT_DAYS_TO_CLEAR;
    }
    if (DEBUG) {
      console.log(`Initial value of ${STORAGE_KEY} is ${daysToClear}`);
    }

    await browser.storage.local.set({
      [STORAGE_KEY]: daysToClear
    });
    return daysToClear;
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
      endTime: (Date.now() - daysToClear * 86400e3) * 1e3
    });
  }

  // 3m, like https://addons.mozilla.org/firefox/addon/expire-history-by-days/
  browser.idle.setDetectionInterval(180);
  browser.idle.onStateChanged.addListener(handleIdleStateChanged);
})();
