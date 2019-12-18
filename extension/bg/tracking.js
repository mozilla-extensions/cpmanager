(function() {
  const KNOWN_EXTENSIONS = [
    "cehomepage@mozillaonline.com",
    "coba@mozilla.com.cn",
    "easyscreenshot@mozillaonline.com",
    "tabtweak@mozillaonline.com",
    "url2qr@mozillaonline.com",
    "wx-assistant@mozillaonline.com",
  ];

  async function handleExternalMessage(message, sender) {
    if (!KNOWN_EXTENSIONS.includes(sender.id)) {
      return Promise.reject("Unknown sender extension");
    }

    switch (message.type) {
      case "trackingEnabled":
        message.dir = "bg2legacy";
        return browser.mozillaonline.
          chinaPackManager.sendLegacyMessage(message);
      default:
        return Promise.reject("Unknown message type");
    }
  }

  browser.runtime.onMessageExternal.addListener(handleExternalMessage);
})();
