(function() {
var UIC = {
  handleEvent: function UIC__handleEvent(aEvent) {
    switch (aEvent.type) {
      case "load":
        this.init();
        break;
    }
  },
  init: function UIC__init(){
    this.installButton("downloads-button");
  },
  installButton: function UIC__installButton(buttonId,toolbarId) {
    toolbarId = toolbarId || "addon-bar";
    var key = "extensions.toolbarbutton.installed."+buttonId;
    if(Application.prefs.getValue(key, false))
      return;

    var toolbar = window.document.getElementById(toolbarId);
    let curSet = toolbar.currentSet;
    if (-1 == curSet.indexOf(buttonId)){
      let newSet = curSet + "," + buttonId;
      toolbar.currentSet = newSet;
      toolbar.setAttribute("currentset", newSet);
      document.persist(toolbar.id, "currentset");
      try{
        BrowserToolboxCustomizeDone(true);
      }catch(e){}
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
