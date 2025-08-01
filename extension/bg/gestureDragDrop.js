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
      browser.search.query({
        text: message.data,
        disposition: "NEW_TAB",
      });
      break;
    case "query":
      if (message.data !== "listening") {
        break;
      }
      return browser.mozillaonline.chinaPackManager.gestureEnabled();
  }

  // This makes the linter happy.
  return null;
});
