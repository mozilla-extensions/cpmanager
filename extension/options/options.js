function createCheckboxesWithOptions(key, value, handleOptionChange) {
  let p = document.createElement("p");

  let checkbox = document.createElement("input");
  checkbox.checked = value;
  checkbox.id = key;
  checkbox.type = "checkbox";
  checkbox.addEventListener("change", handleOptionChange);
  p.appendChild(checkbox);

  let label = document.createElement("label");
  label.setAttribute("for", key);
  let i18nKey = `option.${key}`;
  label.textContent = browser.i18n.getMessage(i18nKey);
  p.appendChild(label);

  document.body.appendChild(p);
}

async function handleLegacyOptionChange(evt) {
  const { id, checked } = evt.target;

  // When enabling gesture, ensure we have <all_urls> host permission.
  if (id === "gesture" && checked) {
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

  await browser.mozillaonline.chinaPackManager.sendLegacyMessage({
    dir: "bg2legacy",
    type: "updateOptions",
    detail: {
      [id]: checked,
    },
  });
}

async function handleStorageOptionChange(evt) {
  return browser.storage.local.set({
    [evt.target.id]: evt.target.checked,
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

  createCheckboxesWithOptions('gesture', initLegacyOptions['gesture'] && await hasAllUrlsPermission(), handleLegacyOptionChange);
  createCheckboxesWithOptions('url2qr', initLegacyOptions['url2qr'], handleLegacyOptionChange);

  const initStorageOptions = await browser.storage.local.get({
    "clearHistory.enabled": true, // defaults display to true
  });
  createCheckboxesWithOptions('clearHistory.enabled', initStorageOptions['clearHistory.enabled'], handleStorageOptionChange);

  // Keep gesture option in sync if <all_urls> gets revoked while options is open.
  browser.permissions.onRemoved.addListener(async (permissions) => {
    if (permissions && Array.isArray(permissions.origins) && permissions.origins.includes("<all_urls>")) {
      const gestureEl = document.getElementById("gesture");
      if (gestureEl) {
        gestureEl.checked = false;
      }
    }
  });
});
