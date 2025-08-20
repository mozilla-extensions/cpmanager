browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  switch (message.type) {
    case "image":
    case "link":
      if (!isValidURL(message.data)) break;

      await openTab(sender, message.data);
      break;

    case "text":
      const tab = await openTab(sender, "about:blank");

      await browser.search.query({
        text: message.data,
        tabId: tab.id,
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

function isValidURL(data) {
  try {
    const url = new URL(data);
    return ["https:", "http:", "mailto:"].includes(url.protocol)
    return true;
  } catch(e) {
    return false;
  }
}

function openTab(sender, url) {
  const props = {
    url,
    windowId: sender.tab.windowId,
    active: true,
  };

  if (!sender.tab.incognito &&
      sender.tab.cookieStoreId &&
      sender.tab.cookieStoreId !== "firefox-private" &&
      sender.tab.cookieStoreId !== "firefox-default") {
    props.cookieStoreId = sender.tab.cookieStoreId;
  }

  return browser.tabs.create(props);
}
