let gestureStartX = -1;
let gestureStartY = -1;

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  switch (message.type) {
    case "dragstart":
      gestureStartX = message.data.X;
      gestureStartY = message.data.Y;
      break;

    case "image":
    case "link":
      if (!validateGestureRangeAndReset(message.data.X, message.data.Y)) break;

      if (!isValidURL(message.data.data)) break;

      await openTab(sender, message.data.data);
      break;

    case "text":
      if (!validateGestureRangeAndReset(message.data.X, message.data.Y)) break;

      const tab = await openTab(sender, "about:blank");

      await browser.search.query({
        text: message.data.data,
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
    return ["https:", "http:", "mailto:"].includes(url.protocol);
  } catch (e) {
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

function validateGestureRangeAndReset(gestureStopX, gestureStopY) {
  if (gestureStartX === -1 || gestureStartY === -1) return false;

  const deltaX = gestureStopX - gestureStartX;
  const deltaY = gestureStopY - gestureStartY;

  gestureStartX = -1;
  gestureStartY = -1;

  // not drag long enough I think
  return deltaX * deltaX + deltaY * deltaY > 25;
}
