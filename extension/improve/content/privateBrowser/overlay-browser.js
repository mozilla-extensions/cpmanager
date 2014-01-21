(function() {
let cePrivateBrowsingUI = {
  handleEvent: function PBUI_handleEvent(aEvent) {
    switch (aEvent.type) {
      case "load":
        this.init();
        break;
      case "unload":
        this.uninit();
        break;
    }
  },
  init: function PBUI_init() {
    this.installButton("ce_privateBrowser");
  },

  uninit: function PBUI_unint() {
  },

  installButton: function PBUI__installButton(buttonId, toolbarId) {
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

window.addEventListener('load'  , cePrivateBrowsingUI, false)
window.addEventListener('unload', cePrivateBrowsingUI, false)
})();
