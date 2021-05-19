(function() {
  const API_BASE = "https://pan.baidu.com/rest/2.0/xpan/nas";
  const APP_ID = "24036664";
  const CLIENT_ID = "F3DFx7mqUSGN3qgjCRyQ2zgwHNcdeI8F";
  const EXTRA_PERMS = {
    origins: ["https://pan.baidu.com/*"],
    permissions: ["notifications"],
  };
  const QUERY_TASK_INTERVAL = 5e3;
  const TASK_TIMERS = new Map();
  const TASKS_COMPLETED = new Map();

  const chinaPackManager = browser.mozillaonline.chinaPackManager;
  const contextMenuId = "save-with-pan-baidu";

  class PanBaiduError extends Error {
    constructor({
      category = "generic",
      httpStatus = 200,
      jsonErrNo = 0,
      extra = "",
    }) {
      super();

      this.name = "PanBaiduError";
      this.category = category;
      this.httpStatus = httpStatus;
      this.jsonErrNo = jsonErrNo;
      this.extra = extra;
    }

    get isAuthError() {
      return this.category === "createdownload" && this.jsonErrNo === -6;
    }

    get message() {
      let param;
      switch (this.category) {
        case "auth":
          param = this.extra;
          break;
        case "createdownload":
          param = this.jsonErrNo;
          break;
        case "http":
          param = this.httpStatus;
          break;
        case "querytask.state":
          param = this.extra;
          break;
        default:
          break;
      }

      return browser.i18n.getMessage(
        `panBaidu.error.${this.category}.${param}`
      ) || browser.i18n.getMessage(
        `panBaidu.error.${this.category}.generic`, `${param}`
      ) || browser.i18n.getMessage(
        "panBaidu.error.generic", `${param}`
      );
    }

    get trackingData() {
      switch (this.category) {
        case "auth":
          return {
            method: "start",
            value: this.extra,
          };
        case "createdownload":
          return {
            method: "start",
            value: `${this.httpStatus}-${this.jsonErrNo}`,
          };
        case "http":
          return {
            method: "start",
            value: this.httpStatus,
          };
        case "querytask.state":
          return {
            method: "failed",
            value: this.extra,
          };
        default:
          return undefined;
      }
    }
  }

  async function addPermissions() {
    let added = await chinaPackManager.addPermissions(EXTRA_PERMS);
    if (!browser.notifications.onClicked.hasListener(handleNotificationClick)) {
      browser.notifications.onClicked.addListener(handleNotificationClick);
    }
    return added;
  }

  async function authorize() {
    let redirectUri = browser.identity.getRedirectURL();
    let scopes = ["basic", "netdisk"];
    let state = `${Math.random()}`;

    let url = new URL("https://openapi.baidu.com/oauth/2.0/authorize");
    url.searchParams.append("client_id", CLIENT_ID);
    url.searchParams.append("confirm_login", "1");
    url.searchParams.append("display", "popup");
    url.searchParams.append("login_type", "sms");
    url.searchParams.append("redirect_uri", redirectUri);
    url.searchParams.append("response_type", "token");
    url.searchParams.append("scope", scopes.join(","));
    url.searchParams.append("state", state);
    let authResultURL = new URL(await browser.identity.launchWebAuthFlow({
      interactive: true,
      url: url.href,
    }));

    let usp = new URLSearchParams(authResultURL.hash.slice(1));
    if (usp.get("state") !== state) {
      throw new PanBaiduError({ category: "auth", extra: "state" });
    }
    if (usp.get("scope") !== scopes.join(" ")) {
      throw new PanBaiduError({ category: "auth", extra: "scope" });
    }

    let accessToken = usp.get("access_token");
    let expiresIn = parseInt(usp.get("expires_in"), 10);
    if (isNaN(expiresIn) || expiresIn <= 0) {
      throw new PanBaiduError({ category: "auth", extra: "expires_in" });
    }
    await browser.storage.local.set({
      "panBaidu.access.token": accessToken,
      "panBaidu.access.validUntil": Date.now() + expiresIn * 0.8e3,
    });
    return accessToken;
  }

  async function createDownload(details) {
    let url = new URL(API_BASE);
    url.searchParams.append("method", "createdownload");
    url.searchParams.append("access_token", details.accessToken);

    let body = new URLSearchParams();
    body.append("appid", APP_ID);
    body.append(
      "save_path",
      browser.i18n.getMessage("panBaidu.createDownload.savePath")
    );
    body.append("selected_idx", "");
    body.append("sha1", "");
    body.append("source_path", details.url);
    body.append("type", "0");

    return sendRequest(url, body);
  }

  async function getAccessToken(forceAuth = false) {
    if (!forceAuth) {
      let {
        "panBaidu.access.token": accessToken,
        "panBaidu.access.validUntil": accessValidUntil,
      } = await browser.storage.local.get({
        "panBaidu.access.token": "",
        "panBaidu.access.validUntil": 0,
      });
      if (accessToken && Date.now() < accessValidUntil) {
        sendTracking({ object: "accessToken", method: "cache" });
        return accessToken;
      }
    }

    sendTracking({
      object: "accessToken",
      method: forceAuth ? "retry" : "fresh",
    });
    return authorize();
  }

  async function handleContextClick(info, tab) {
    await addPermissions();
    let entrypoint = "contextMenu";
    let url;
    if (info.mediaType && info.srcUrl) {
      entrypoint = `contextMenu-${info.mediaType}`;
      url = info.srcUrl;
    }
    if (!url) {
      // Notify user that we don't have an url
      return Promise.reject("No url to download");
    }

    return initiateDownloadFor(url, { entrypoint, tab });
  }

  async function handleMenuShown(info, tab) {
    if (!info.menuIds.includes(contextMenuId)) {
      return;
    }

    let entrypoint = "contextMenu";
    if (info.mediaType) {
      entrypoint = `contextMenu-${info.mediaType}`;
    }

    sendTracking({ object: entrypoint, method: "shown" });
  }

  async function handleNotificationClick(notificationId) {
    if (!TASKS_COMPLETED.has(notificationId)) {
      return;
    }
    let { tab } = TASKS_COMPLETED.get(notificationId);
    TASKS_COMPLETED.delete(notificationId);
    sendTracking({ object: "notification", method: "click" });

    let savePath = browser.i18n.getMessage("panBaidu.createDownload.savePath");
    let path = encodeURIComponent(`/来自：第三方应用/${savePath}`);
    let properties = {
      url: `https://pan.baidu.com/disk/main?from=firefox_plugin#/index?category=all&path=${path}`,
    };

    let panBaiduTabs = await browser.tabs.query({
      url: "https://pan.baidu.com/disk*",
    });
    if (panBaiduTabs.length) {
      let panBaiduTab = panBaiduTabs[0];
      if (panBaiduTab.url === properties.url) {
        await browser.tabs.reload(panBaiduTab.id, { bypassCache: true });
      }
      Object.assign(properties, { active: true, loadReplace: true });
      await browser.tabs.update(panBaiduTab.id, properties);
      await browser.windows.update(panBaiduTab.windowId, { focused: true });
    } else {
      if (tab) {
        Object.assign(properties, {
          openerTabId: tab.id,
          windowId: tab.windowId,
        });
      }
      let openedTab = await browser.tabs.create(properties);
      await browser.windows.update(openedTab.windowId, { focused: true });
    }
  }

  async function handleUCTTakenOver(result, tab) {
    await addPermissions();
    switch (result.id) {
      case "offlineDownload":
        return initiateDownloadFor(result.url, {
          entrypoint: `uctOfflineDownload`,
          tab,
        });
      default:
        console.error("Unknown option");
        break;
    }
    return undefined;
  }

  async function initiateDownloadFor(url, {
    entrypoint = "unspecified",
    forceAuth = false,
    tab = null,
  }) {
    try {
      let accessToken = await getAccessToken(forceAuth);
      let jsonObj = await createDownload({ accessToken, url });
      let taskId = jsonObj.task_id.toString();
      await updateOrCreateNotification({
        entrypoint,
        progress: 0,
        taskId,
        taskName: url,
      });
      await taskStatusUntilFinish({ accessToken, entrypoint, tab, taskId });
    } catch (ex) {
      if (!(ex instanceof PanBaiduError)) {
        console.error(ex);
        return;
      }

      if (ex.isAuthError && !forceAuth) {
        await initiateDownloadFor(url, { entrypoint, forceAuth: true, tab });
        return;
      }

      await updateOrCreateNotification({
        entrypoint,
        error: ex,
        taskId: undefined,
        taskName: url,
      });
    }
  }

  async function queryTask(details) {
    let url = new URL(API_BASE);
    url.searchParams.append("method", "querytask");
    url.searchParams.append("access_token", details.accessToken);

    let body = new URLSearchParams();
    body.append("appid", APP_ID);
    body.append("task_id", details.taskId);

    return sendRequest(url, body);
  }

  async function reportTaskStatus(details) {
    // NOT showing PanBaiduErrors from `queryTask` call as alerts
    let jsonObj = await queryTask(details);
    let dataObj = jsonObj.data[details.taskId] || jsonObj.data;

    switch (dataObj.status) {
      case "0":
        TASKS_COMPLETED.set(details.taskId, details);
        await updateOrCreateNotification({
          entrypoint: details.entrypoint,
          progress: 100,
          taskId: details.taskId,
          taskName: dataObj.task_name,
        });
        clearInterval(TASK_TIMERS.get(details.taskId));
        TASK_TIMERS.delete(details.taskId);
        break;
      case "1":
        // Not showing any notification when in progress
        break;
      default:
        let { status, task_name: taskName } = dataObj;
        await updateOrCreateNotification({
          entrypoint: details.entrypoint,
          error: new PanBaiduError({
            category: "querytask.state",
            extra: status,
          }),
          taskId: details.taskId,
          taskName,
        });
        clearInterval(TASK_TIMERS.get(details.taskId));
        TASK_TIMERS.delete(details.taskId);
        break;
    }
  }

  async function sendRequest(url, body) {
    let resp = await fetch(url, { method: "POST", body, credentials: "omit" });
    let error;
    if (!resp.ok) {
      error = new PanBaiduError({
        category: "http",
        httpStatus: resp.status,
      });
    }

    try {
      let jsonObj = await resp.json();
      if (jsonObj.errno) {
        error = new PanBaiduError({
          category: url.searchParams.get("method"),
          httpStatus: resp.status,
          jsonErrNo: jsonObj.errno,
        });
      } else {
        return jsonObj;
      }
    } catch (ex) {
      console.error(ex);
    }

    throw error;
  }

  async function sendTracking(data) {
    data = Object.assign({}, {
      category: "panBaidu",
    }, data);

    try {
      return chinaPackManager.sendLegacyMessage({
        data,
        dir: "bg2legacy",
        type: "sendTracking",
      });
    } catch (ex) {
      console.error(ex);
    }
    return undefined;
  }

  async function taskStatusUntilFinish(details) {
    TASK_TIMERS.set(
      details.taskId,
      setInterval(reportTaskStatus, QUERY_TASK_INTERVAL, details)
    );
  }

  async function updateOrCreateNotification({
    entrypoint,
    error,
    progress,
    taskId,
    taskName,
  }) {
    let message;
    let title = browser.i18n.getMessage("panBaidu.notifications.title");
    let trackingData;

    if (error) {
      message = browser.i18n.getMessage(
        "panBaidu.notifications.msg.failed",
        [taskName, error.message]
      );

      if (error.trackingData) {
        trackingData = Object.assign({}, {
          object: entrypoint,
        }, error.trackingData);
      }
    } else if (progress === 0) {
      message = browser.i18n.getMessage(
        "panBaidu.notifications.msg.started",
        taskName
      );
      trackingData = { object: entrypoint, method: "start" };
    } else if (progress === 100) {
      message = browser.i18n.getMessage(
        "panBaidu.notifications.msg.completed",
        taskName
      );
      title = browser.i18n.getMessage(
        "panBaidu.notifications.title.completed"
      );
      trackingData = { object: entrypoint, method: "complete" };
    }

    let options = {
      type: "basic",
      title,
      message,
      iconUrl: "icons/panBaidu.png",
    };

    let updated = false;
    if (browser.notifications.update) {
      updated = await browser.notifications.update(taskId, options);
    }
    if (!updated) {
      await browser.notifications.create(taskId, options);
    }

    if (trackingData) {
      await sendTracking(trackingData);
    }
  }

  browser.menus.create({
    contexts: ["audio", "image", "video"],
    id: contextMenuId,
    onclick: handleContextClick,
    targetUrlPatterns: ["*://*/*"],
    title: browser.i18n.getMessage("panBaidu.contextMenu.label"),
  });
  browser.menus.onShown.addListener(handleMenuShown);
  chinaPackManager.onUCTTakenOver.addListener(
    handleUCTTakenOver,
    [{
      id: "offlineDownload",
      label: browser.i18n.getMessage("panBaidu.uct.offlineDownload.label"),
      notFor: ["https://pan.baidu.com/*"],
    }]
  );
  if (browser.notifications) {
    browser.notifications.onClicked.addListener(handleNotificationClick);
  }
})();
