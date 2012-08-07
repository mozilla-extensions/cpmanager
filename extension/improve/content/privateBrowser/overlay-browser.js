(function() {
var _privateBrowsingService = Cc["@mozilla.org/privatebrowsing;1"].
                                   getService(Ci.nsIPrivateBrowsingService);
let cePrivateBrowsingUI = {
  handleEvent: function PBUI_handleEvent(aEvent) {
    switch (aEvent.type) {
      case "load":
        this.init();
        break;
      case "unload":
        this.uninit();
        break;
      case "aftercustomization":
        this.initUI();
        break;
    }
  },
  initUI: function PBUI_initUI(){
    if (_privateBrowsingService.privateBrowsingEnabled)
      this.onEnterPrivateBrowsing();
    else
      this.onExitPrivateBrowsing();
  },
  init: function PBUI_init() {
    Services.obs.addObserver(this, "private-browsing", false);
    Services.obs.addObserver(this, "private-browsing-transition-complete", false);
    var toolbox = document.getElementById("navigator-toolbox");
    toolbox.addEventListener("aftercustomization",this,false)

    this.initUI();
    this.installButton("ce_privateBrowser");
  },

  uninit: function PBUI_unint() {
    Services.obs.removeObserver(this, "private-browsing");
    Services.obs.removeObserver(this, "private-browsing-transition-complete");
    var toolbox = document.getElementById("navigator-toolbox");
    toolbox.removeEventListener("aftercustomization",this,false)
  },

  observe: function PBUI_observe(aSubject, aTopic, aData) {
    if (aTopic == "private-browsing") {
      if (aData == "enter")
        this.onEnterPrivateBrowsing();
      else if (aData == "exit")
        this.onExitPrivateBrowsing();
    }
  },

  onEnterPrivateBrowsing: function PBUI_onEnterPrivateBrowsing() {
    if (_privateBrowsingService.autoStarted) {
      let appmenupbMenuItem = document.getElementById("ce_privateBrowser");
      if(appmenupbMenuItem){
        appmenupbMenuItem.setAttribute("disabled", "true");
      }
    }
    this._setPBMenuTitle("stop");
  },

  onExitPrivateBrowsing: function PBUI_onExitPrivateBrowsing() {
    this._setPBMenuTitle("start");
    let appmenupbMenuItem = document.getElementById("ce_privateBrowser");
    if(appmenupbMenuItem){
      appmenupbMenuItem.removeAttribute("disabled");
    }
  },

  _setPBMenuTitle: function PBUI__setPBMenuTitle(aMode) {
    let appmenupbMenuItem = document.getElementById("ce_privateBrowser");
    if(appmenupbMenuItem){
      appmenupbMenuItem.setAttribute("label", appmenupbMenuItem.getAttribute(aMode + "label"));
      appmenupbMenuItem.setAttribute("tooltiptext", appmenupbMenuItem.getAttribute(aMode + "label"));
      appmenupbMenuItem.setAttribute("accesskey", appmenupbMenuItem.getAttribute(aMode + "accesskey"));
      if(aMode=="stop")
        appmenupbMenuItem.setAttribute("checked","true");
      else
        appmenupbMenuItem.removeAttribute("checked");
    }
  },
  installButton: function PBUI__installButton(buttonId,toolbarId) {
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
};

window.addEventListener('load'  , cePrivateBrowsingUI, false)
window.addEventListener('unload', cePrivateBrowsingUI, false)
})();
