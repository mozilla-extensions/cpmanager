(async function() {
  async function maybeHide(tab) {
    if (tab.active) {
      const settings = await browser.mozillaonline.chinaPackManager.sendLegacyMessage({ type: "initOptions" });
      if (await browser.pageAction.isShown({tabId: tab.id}) !== settings.url2qr) {
        if (!settings.url2qr) {
          browser.pageAction.hide(tab.id)
        } else {
          browser.pageAction.show(tab.id)
        }
      }
    }
  }

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    maybeHide(tab);
  }, { properties: ["url"] });

  browser.tabs.onActivated.addListener(async (tabInfo) => {
    const tab = await browser.tabs.get(tabInfo.tabId);
    maybeHide(tab);
  });
})();
