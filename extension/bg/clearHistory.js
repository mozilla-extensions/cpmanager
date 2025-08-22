(async function() {
  const DEBUG = false;
  const DEFAULT_DAYS_TO_KEEP = 91;
  const DAYS_KEY = "clearHistory.days";
  const ENABLED_KEY = "clearHistory.enabled";

  async function getDaysToKeep() {
    let {
      [ENABLED_KEY]: enabled,
    } = await browser.storage.local.get([DAYS_KEY, ENABLED_KEY]);

    if (enabled !== undefined) {
      return enabled ? DEFAULT_DAYS_TO_KEEP : 0;
    }
    if (DEBUG) {
      console.log(`"${ENABLED_KEY}" missing from storage.local`);
    }

    await browser.storage.local.set({
      [DAYS_KEY]: DEFAULT_DAYS_TO_KEEP,
      [ENABLED_KEY]: true,
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
      endTime: Date.now() - daysToKeep * 86400e3,
    });
  }

  // 3m, like https://addons.mozilla.org/firefox/addon/expire-history-by-days/
  browser.idle.setDetectionInterval(180);
  browser.idle.onStateChanged.addListener(handleIdleStateChanged);
})();
