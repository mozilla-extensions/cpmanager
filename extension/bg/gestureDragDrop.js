browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  switch (message.type) {
    case "image":
    case "link":
      browser.tabs.create({
        url: message.data,
        windowId: sender.tab.windowId,
        active: true,
      });
      break;
    case "text":
      const url = await browser.mozillaonline.chinaPackManager.search(message.data);
      if (url) {
        browser.tabs.create({
          url,
          windowId: sender.tab.windowId,
          active: true,
        });
      }
      break;
    case "query":
      if (message.data !== "listening") {
        break;
      }
      return await browser.mozillaonline.chinaPackManager.gestureEnabled();
  }
});
