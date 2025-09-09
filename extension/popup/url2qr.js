/* global QRCode */

(async () => {
  async function getActiveTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
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

  await refreshFromActiveTab();

  const onUpdatedListener = (tabId, changeInfo) => {
    if (!changeInfo.url) return;
    getActiveTab().then(active => {
      if (active && active.id === tabId) render(changeInfo.url);
    });
  };
  browser.tabs.onUpdated.addListener(onUpdatedListener);

  const onActivatedListener = () => {
    refreshFromActiveTab();
  };
  browser.tabs.onActivated.addListener(onActivatedListener);

  window.addEventListener("unload", () => {
    browser.tabs.onUpdated.removeListener(onUpdatedListener);
    browser.tabs.onActivated.removeListener(onActivatedListener);
  });
})();
