let gestureStartX = -1;
let gestureStartY = -1;

const GESTURE_SCRIPT_ID = "gesture-script";
const ALL_URLS_PERMISSION = { origins: ["<all_urls>"] };

// The content script matches <all_urls>, which is an *optional* permission.
// registerContentScripts() succeeds even without the host permission, but then
// injects into no page at all and drag silently does nothing. The feature is
// therefore only truly on when BOTH the option is enabled AND the permission is
// granted.
async function isGestureUsable() {
  const data = await browser.storage.local.get({ "gesture.enabled": false });
  if (!data["gesture.enabled"]) {
    return false;
  }
  try {
    return await browser.permissions.contains(ALL_URLS_PERMISSION);
  } catch (e) {
    console.error(`failed to check <all_urls> permission: ${e}`);
    return false;
  }
}

async function registerOrUnregisterScript(enabled) {
  try {
    if (enabled) {
      // Drop any registration left over from a previous session/update so we
      // always (re)register with the current parameters. unregisterContentScripts
      // with an empty filter is a no-op when nothing is registered.
      await browser.scripting.unregisterContentScripts({});
      await browser.scripting.registerContentScripts([{
        id: GESTURE_SCRIPT_ID,
        matches: ["<all_urls>"],
        matchOriginAsFallback: true,
        js: ["/contentscripts/gesture-dragdrop.js"],
        allFrames: true,
        runAt: "document_start",
      }]);
    } else {
      // Unregister the only script, if any.
      await browser.scripting.unregisterContentScripts({});
    }
  } catch (e) {
    console.error(`failed to register/unregister content scripts: ${e}`);
  }
}

async function syncScriptRegistration() {
  await registerOrUnregisterScript(await isGestureUsable());
}

// Initial registration on startup.
syncScriptRegistration();

// React to the user toggling the option in the settings page.
browser.storage.local.onChanged.addListener(changes => {
  if (!changes["gesture.enabled"]) {
    return;
  }
  syncScriptRegistration();
});

// React to the <all_urls> permission being granted or revoked out-of-band
// (e.g. by a browser update reinstalling the system add-on). Without this the
// script can stay "registered" while injecting nowhere, or fail to come back
// when the permission is re-granted.
browser.permissions.onAdded.addListener(permissions => {
  if (permissions.origins && permissions.origins.includes("<all_urls>")) {
    syncScriptRegistration();
  }
});
browser.permissions.onRemoved.addListener(permissions => {
  if (permissions.origins && permissions.origins.includes("<all_urls>")) {
    syncScriptRegistration();
  }
});

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
