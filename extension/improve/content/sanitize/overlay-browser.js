var ce_sanitizeHistory = {
  handleEvent: function ce_sanitizeHistory__handleEvent(aEvent) {
    switch (aEvent.type) {
      case "load":
        this.installButton("ce_sanitizeHistory");
        this.bindPopup("ce_sanitizeHistory","ce_sanitizeHistory_popup")
        break;
    }
  },
  bindPopup: function ce_sanitizeHistory__bindPopup(buttonId,menuId){
    var button = document.getElementById(buttonId)
    var menu = document.getElementById(menuId)
    button.addEventListener("mousedown",function(aEvent){
      if (aEvent.button != 0 )
        return;
      menu.openPopup(button, "before_start", 0, 0, false, false, aEvent);
    },false);
  },
  installButton: function ce_sanitizeHistory__installButton(buttonId,toolbarId) {
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
  onPopupShowing: function ce_sanitizeHistory__onPopupShowing(){
    var selClose = Application.prefs.getValue("privacy.sanitize.sanitizeOnShutdown",false);
//    var sel7Days = Application.prefs.getValue("privacy.sanitize.sanitize7Days",false);
    if(selClose)
      document.getElementById("ce_sanitizeHistory_onclose").setAttribute("checked","true");
//    else if(sel7Days)
//      document.getElementById("ce_sanitizeHistory_7days").setAttribute("checked","true");
    else
      document.getElementById("ce_sanitizeHistory_none").setAttribute("checked","true");

  },
  onPopupHiding: function ce_sanitizeHistory__onPopupHiding(){
    var selClose = document.getElementById("ce_sanitizeHistory_onclose").getAttribute("checked") =="true";
//    var sel7Days = document.getElementById("ce_sanitizeHistory_7days").getAttribute("checked") =="true";
    Application.prefs.setValue("privacy.sanitize.sanitizeOnShutdown",selClose);
//    Application.prefs.setValue("privacy.sanitize.sanitize7Days",sel7Days);
  },
};
window.addEventListener('load'  , ce_sanitizeHistory, false);