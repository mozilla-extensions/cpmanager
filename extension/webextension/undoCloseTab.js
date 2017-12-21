(function() {
  const DEBUG = false;

  async function handleBrowserActionClick(tab) {
    try {
      let [session] = await sessionsToRestoreForWindow(tab.windowId, 1);
      if (!session) {
        console.error("No tab session for this window to restore");
        return;
      }

      await browser.sessions.restore(session.tab.sessionId);
    } catch (ex) {
      console.error(ex.toString());
    }
  }

  // session change may happen w/o change to active tab
  async function handleSessionChange() {
    try {
      let [session] = await browser.sessions.getRecentlyClosed({maxResults: 1});
      if (!session || !session.tab) {
        return;
      }

      let windowId = session.tab.windowId;
      let [tab] = await browser.tabs.query({active: true, windowId});

      await toggleBrowserAction({tabId: tab.id, windowId});
    } catch (ex) {
      console.error(ex.toString());
    }
  }

  // browserAction is globally disabled and will be enabled per-tab,
  // also restore a tab won't trigger session change event
  async function handleTabActivate({tabId, windowId}) {
    try {
      await toggleBrowserAction({tabId, windowId});
    } catch (ex) {
      console.error(ex.toString());
    }
  }

  // location change in active tab will revert browserAction to default,
  // see https://bugzil.la/1395074
  async function handleTabUpdate(tabId, changeInfo, tab) {
    try {
      if (!tab.active || changeInfo.url === undefined) {
        return;
      }

      await toggleBrowserAction({tabId: tab.id, windowId: tab.windowId});
    } catch (ex) {
      console.error(ex.toString());
    }
  }

  // switch between already opened windows
  async function handleWindowFocusChange(windowId) {
    try {
      let sessionsToRestore = await sessionsToRestoreForWindow(windowId);
      await rebuildBrowserActionContext(sessionsToRestore);
    } catch (ex) {
      console.error(ex.toString());
    }
  }

  async function rebuildBrowserActionContext(sessionsToRestore) {
    await browser.menus.removeAll();
    if (!sessionsToRestore.length) {
      return;
    }

    let mostRecentSessions = sessionsToRestore.slice(0,
      browser.menus.ACTION_MENU_TOP_LEVEL_LIMIT - 1);
    for (let session of mostRecentSessions) {
      browser.menus.create({
        contexts: ["browser_action"],
        icons: {
          "16": (session.tab.favIconUrl || "icons/defaultFavicon.svg")
        },
        onclick: () => browser.sessions.restore(session.tab.sessionId),
        title: session.tab.title
      });
    }

    browser.menus.create({
      contexts: ["browser_action"],
      onclick: () => {
        return Promise.all(sessionsToRestore.map(session => {
          return browser.sessions.restore(session.tab.sessionId);
        }));
      },
      title: browser.i18n.getMessage("restoreAllTabs")
    });
  }

  async function sessionsToRestoreForWindow(
    windowId,
    limit = browser.sessions.MAX_SESSION_RESULTS
  ) {
    let sessions = await browser.sessions.getRecentlyClosed();

    return sessions.filter(session => {
      return session.tab && session.tab.windowId === windowId;
    }).slice(0, limit);
  }

  async function toggleBrowserAction({tabId, windowId}) {
    if (DEBUG) {
      console.log(`toggle browserAction for tab ${tabId} in win ${windowId}`);
    }
    let sessionsToRestore = await sessionsToRestoreForWindow(windowId);
    if (sessionsToRestore.length) {
      browser.browserAction.enable(tabId);
    } else {
      browser.browserAction.disable(tabId);
    }

    let win = await browser.windows.get(windowId);
    if (!win.focused) {
      return;
    }

    await rebuildBrowserActionContext(sessionsToRestore);
  }

  browser.browserAction.disable();
  browser.browserAction.onClicked.addListener(handleBrowserActionClick);
  browser.sessions.onChanged.addListener(handleSessionChange);
  browser.tabs.onActivated.addListener(handleTabActivate);
  browser.tabs.onUpdated.addListener(handleTabUpdate);
  browser.windows.onFocusChanged.addListener(handleWindowFocusChange);
})();
