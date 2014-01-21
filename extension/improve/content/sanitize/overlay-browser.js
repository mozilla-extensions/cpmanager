(function() {
  let gCHNotificationInfoBar = {

    handleEvent: function Improve_CE__handleEvent(aEvent) {
      switch (aEvent.type) {
        case "load":
          setTimeout(this.init.bind(this), 1000);
          break;
      }
    },

    _CLEAE_HISTORY_NOTIFICATION: "clear-history",

    get _notificationBox() {
      delete this._notificationBox;
      var box = document.getElementById("global-notificationbox") || gBrowser.getNotificationBox();
      return this._notificationBox = box;
    },

    init: function() {
      if (Application.prefs.getValue("extensions.cmimprove.clearhistory.notification.shown", false)) {
        return;
      }
      this._displayInfoBar();
      Application.prefs.setValue("extensions.cmimprove.clearhistory.notification.shown", true);
    },

    _getNotification: function (name) {
      name = name || this._CLEAE_HISTORY_NOTIFICATION;
      return this._notificationBox.getNotificationWithValue(name);
    },

    _displayInfoBar: function () {
      var _bundles = Cc["@mozilla.org/intl/stringbundle;1"].
              getService(Ci.nsIStringBundleService).
              createBundle("chrome://cmimprove/locale/browser.properties");
      function getString(key) {
        return _bundles.GetStringFromName(key);
      }

      if (this._getNotification()) {
        return;
      }

      let message = getString("ce.clearHistory.message");
      let buttons = [{
        label: getString("ce.clearHistory.button.label"),
        accessKey: getString("ce.clearHistory.button.accessKey"),
        popup: null,
        callback: function () {
          openPreferences("paneMain");
        },
      }];

      let notification = this._notificationBox.appendNotification(
        message,
        this._CLEAE_HISTORY_NOTIFICATION,
        null,
        this._notificationBox.PRIORITY_INFO_HIGH,
        buttons,
        function onEvent(event) {
          if (event == "removed") {
            this._clearNotification();
          }
        }.bind(this)
      );
    },

    _clearNotification: function () {
      let notification = this._getNotification();
      if (notification) {
        notification.close();
      }
    },

  };
//  window.addEventListener("load", gCHNotificationInfoBar, false)
})();

var ce_sanitizeHistory = {
  handleEvent: function ce_sanitizeHistory__handleEvent(aEvent) {
    switch (aEvent.type) {
      case "load":
        this.init();
        break;
      case "aftercustomization":
        this.initUI();
        break;
    }
  },

  init: function ce_sanitizeHistory__init() {
    this.installButton("ce_sanitizeHistory");
    this.initUI();
    var toolbox = document.getElementById("navigator-toolbox");
    toolbox.addEventListener("aftercustomization", this, false)
  },

  initUI: function ice_sanitizeHistory__initUI() {
    this.bindPopup("ce_sanitizeHistory","ce_sanitizeHistory_popup")
  },

  bindPopup: function ce_sanitizeHistory__bindPopup(buttonId, menuId) {
    var button = document.getElementById(buttonId)
    if (!button)
      return;
    var menu = document.getElementById(menuId)
    button.addEventListener("mousedown", function(aEvent) {
      if (aEvent.button != 0 )
        return;
      menu.openPopup(button, "before_start", 0, 0, false, false, aEvent);
    }, false);
  },

  installButton: function ce_sanitizeHistory__installButton(buttonId, toolbarId) {
    toolbarId = toolbarId || "addon-bar";
    var key = "extensions.toolbarbutton.installed."+buttonId;
    if (Application.prefs.getValue(key, false))
      return;

    var toolbar = window.document.getElementById(toolbarId);
    let curSet = toolbar.currentSet;
    if (-1 == curSet.indexOf(buttonId)) {
      let newSet = curSet + "," + buttonId;
      toolbar.currentSet = newSet;
      toolbar.setAttribute("currentset", newSet);
      document.persist(toolbar.id, "currentset");
      try {
        BrowserToolboxCustomizeDone(true);
      } catch(e) {}
    }
    if (toolbar.getAttribute("collapsed") == "true") {
      toolbar.setAttribute("collapsed", "false");
    }
    document.persist(toolbar.id, "collapsed");
    Application.prefs.setValue(key, true);
  },

};
window.addEventListener('load'  , ce_sanitizeHistory, false);