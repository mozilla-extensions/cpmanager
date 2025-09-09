browser.mozillaonline.chinaPackManager.onURL2QRPrefChange.addListener(enabled => prefChanged(enabled));

browser.mozillaonline.chinaPackManager.url2qrEnabled().then(enabled => {
  // By default, the button is shown via
  // page_action.show_matches in manifest.json.
  // Dynamically hide if disabled.
  if (!enabled) {
    prefChanged(enabled);
  }
});

async function prefChanged(enabled) {
  const tabs = await browser.tabs.query({
    url: "*://*/*", // http(s) only
  });
  for (const tab of tabs) {
    if (enabled) {
     browser.pageAction.show(tab.id);
    } else {
     browser.pageAction.hide(tab.id);
    }
  }

  if (enabled) {
    browser.tabs.onCreated.removeListener(onCreatedListener);
    browser.tabs.onUpdated.removeListener(onUpdatedListener);
    browser.tabs.onActivated.removeListener(onActivatedListener);
    return;
  }

  browser.tabs.onCreated.addListener(onCreatedListener);
  browser.tabs.onUpdated.addListener(onUpdatedListener, { properties: ["url"]});
  browser.tabs.onActivated.addListener(onActivatedListener);
}

function onCreatedListener(tab) {
  if (!tab.active) return;
  browser.pageAction.hide(tab.id);
}

function onUpdatedListener(tabId, changeInfo, tab) {
  if (!tab.active) return;
  browser.pageAction.hide(tabId);
}

async function onActivatedListener(activeInfo) {
  await browser.pageAction.hide(activeInfo.tabId);
}
