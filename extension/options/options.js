function createCheckboxesWithOptions(options, handleOptionChange) {
  for (let option in options) {
    let p = document.createElement("p");

    let checkbox = document.createElement("input");
    checkbox.checked = options[option];
    checkbox.id = option;
    checkbox.type = "checkbox";
    checkbox.addEventListener("change", handleOptionChange);
    p.appendChild(checkbox);

    let label = document.createElement("label");
    label.setAttribute("for", option);
    let i18nKey = `option.${option}`;
    label.textContent = browser.i18n.getMessage(i18nKey);
    p.appendChild(label);

    document.body.appendChild(p);
  }
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

  return browser.mozillaonline.chinaPackManager.sendLegacyMessage({
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

window.addEventListener("DOMContentLoaded", async evt => {
  let initLegacyOptions = await browser.mozillaonline.
    chinaPackManager.sendLegacyMessage({
      dir: "bg2legacy",
      type: "initOptions",
    });
  createCheckboxesWithOptions(initLegacyOptions, handleLegacyOptionChange);

  let initStorageOptions = await browser.storage.local.get({
    "clearHistory.enabled": true, // defaults display to true
  });
  createCheckboxesWithOptions(initStorageOptions, handleStorageOptionChange);
});
