let url2qrEnabled = true;

browser.mozillaonline.chinaPackManager.onURL2QRPrefChange.addListener(enabled => prefChanged(enabled));
browser.mozillaonline.chinaPackManager.url2qrEnabled().then(enabled => prefChanged(enabled));
browser.tabs.onCreated.addListener((tab) => hideOrShowPageAction(tab.id));

async function prefChanged(enabled) {
  url2qrEnabled = enabled;

  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    hideOrShowPageAction(tab.id);
  }
}

function hideOrShowPageAction(tabId) {
  if (url2qrEnabled) {
   browser.pageAction.show(tabId);
  } else {
   browser.pageAction.hide(tabId);
  }
}
