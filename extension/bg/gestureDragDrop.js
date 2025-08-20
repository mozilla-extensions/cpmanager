let gestureStartX = -1;
let gestureStartY = -1;

const GESTURE_SCRIPT_ID = "gesture-script";

async function registerOrUnregisterScript(enabled) {
  try {
    if (enabled) {
      await browser.scripting.registerContentScripts([{
        id: GESTURE_SCRIPT_ID,
        matches: ["<all_urls>"],
        matchOriginAsFallback: true,
        js: ["/contentscripts/gesture-dragdrop.js"],
        allFrames: true,
        runAt: "document_start",
      }]);
    } else {
      await browser.scripting.unregisterContentScripts({ids: [ GESTURE_SCRIPT_ID ]});
    }
  } catch (e) {
    console.error(`failed to register/unregister content scripts: ${e}`);
  }
}

browser.mozillaonline.chinaPackManager.onGesturePrefChange.addListener(enabled => {
  registerOrUnregisterScript(enabled);
});

browser.mozillaonline.chinaPackManager.gestureEnabled().then(enabled => registerOrUnregisterScript(enabled));

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
