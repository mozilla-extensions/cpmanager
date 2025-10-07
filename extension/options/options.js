function createCheckboxesWithOptions(key, value, i18nKey, handleOptionChange) {
  let p = document.createElement("p");

  let checkbox = document.createElement("input");
  checkbox.checked = value;
  checkbox.id = key;
  checkbox.type = "checkbox";
  checkbox.addEventListener("change", handleOptionChange);
  p.appendChild(checkbox);

  let label = document.createElement("label");
  label.setAttribute("for", key);
  label.textContent = browser.i18n.getMessage(i18nKey);
  p.appendChild(label);

  document.body.appendChild(p);
}

async function handleLegacyOptionChange(evt) {
  const { id, checked } = evt.target;

  await browser.mozillaonline.chinaPackManager.sendLegacyMessage({
    dir: "bg2legacy",
    type: "updateOptions",
    detail: {
      [id]: checked,
    },
  });
}

async function handleStorageOptionChange(evt) {
  const { id, checked } = evt.target;

  // When enabling gesture, ensure we have <all_urls> host permission.
  if (id === "gesture.enabled" && checked) {
    try {
      const granted = await browser.permissions.request({ origins: ["<all_urls>"] });
      if (!granted) {
        evt.target.checked = false;
        return;
      }
    } catch (e) {
      console.error("Failed to request <all_urls> permission:", e);
      evt.target.checked = false;
      return;
    }
  }

  await browser.storage.local.set({
    [id]: checked,
  });
}

async function hasAllUrlsPermission() {
  try {
    return await browser.permissions.contains({ origins: ["<all_urls>"] });
  } catch (e) {
    console.error(`failed to check permissions: ${e}`);
    return false;
  }
}

window.addEventListener("DOMContentLoaded", async evt => {
  const initLegacyOptions = await browser.mozillaonline.
    chinaPackManager.sendLegacyMessage({
      dir: "bg2legacy",
      type: "initOptions",
    });

  createCheckboxesWithOptions("url2qr", initLegacyOptions.url2qr, "option.url2qr", handleLegacyOptionChange);

  const initStorageOptions = await browser.storage.local.get({
    "clearHistory.enabled": true, // defaults display to true
    "gesture.enabled": false, // defaults display to false
  });

  createCheckboxesWithOptions("gesture.enabled", initStorageOptions["gesture.enabled"] && await hasAllUrlsPermission(), "option.gesture", handleStorageOptionChange);
  createCheckboxesWithOptions("clearHistory.enabled", initStorageOptions["clearHistory.enabled"], "option.clearHistory.enabled", handleStorageOptionChange);

  // Keep gesture option in sync if <all_urls> gets revoked while options is open.
  browser.permissions.onRemoved.addListener(async (permissions) => {
    if (permissions && Array.isArray(permissions.origins) && permissions.origins.includes("<all_urls>")) {
      const gestureEl = document.getElementById("gesture.enabled");
      if (gestureEl) {
        gestureEl.checked = false;
      }
    }
  });

  // Keep gesture option in sync if <all_urls> gets revoked while options is open.
  browser.permissions.onRemoved.addListener(async (permissions) => {
    if (permissions && Array.isArray(permissions.origins) && permissions.origins.includes("<all_urls>")) {
      const gestureEl = document.getElementById("gesture.enabled");
      if (gestureEl) {
        gestureEl.checked = false;
      }
    }
  });
});
