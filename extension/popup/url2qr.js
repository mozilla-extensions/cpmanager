/* global QRCode */

(async () => {
  let lastWindowId;

  async function getActiveTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    lastWindowId = tab.windowId;
    return tab;
  }

  let qr;

  function ensureQR() {
    if (!qr) {
      const qrel = document.getElementById("qrcode");
      qr = new QRCode(qrel, {
        width: 220,
        height: 220,
        correctLevel: QRCode.CorrectLevel.M,
      });

      const tip = browser.i18n.getMessage("URL2QR.instructions");
      const node = qrel.querySelector("img") || qrel;
      node.setAttribute("title", tip);
      node.setAttribute("aria-label", tip);
    }
  }

  function render(url) {
    ensureQR();
    qr.clear();
    qr.makeCode(url || "");
  }

  async function refreshFromActiveTab() {
    try {
      const tab = await getActiveTab();
      render(tab && tab.url);
    } catch (e) {
      console.error(e);
    }
  }

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url) return;
    if (tab && tab.windowId === lastWindowId) render(changeInfo.url);
  });

  browser.tabs.onActivated.addListener(() => {
    refreshFromActiveTab();
  });

  await refreshFromActiveTab();
})();
