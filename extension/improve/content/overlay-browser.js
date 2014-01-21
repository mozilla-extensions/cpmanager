(function() {
var UIC = {
  handleEvent: function UIC__handleEvent(aEvent) {
    switch (aEvent.type) {
      case "load":
        this.init();
        setTimeout(this.fixUrlbar.bind(this), 1000);
        break;
    }
  },
  fixUrlbar: function UIC__fixUrlbar() {
    if (!!document.getElementById("urlbar-container"))
      return;

    var toolbar = document.getElementById("nav-bar");
    let curSet = toolbar.currentSet;
    let arr = curSet.split(",");
    let needs = ["unified-back-forward-button",
                 "urlbar-container",
                 "reload-button",
                 "stop-button",
                 "search-container",
                ];
   needs.forEach(function(id) {
      var index = arr.indexOf(id);
      if (-1 != index) {
        arr.splice(index, 1);
      }
    });
    curSet = needs.concat(arr).join(",");
    toolbar.currentSet = curSet;
    toolbar.setAttribute("currentset", curSet);
    document.persist(toolbar.id, "currentset");
    try {
      BrowserToolboxCustomizeDone(true);
    } catch(e) {}
  },
  init: function UIC__init() {
    this.installButton("downloads-button");
  },
  installButton: function UIC__installButton(buttonId, toolbarId) {
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
}
window.addEventListener('load'  , UIC, false);
})();
