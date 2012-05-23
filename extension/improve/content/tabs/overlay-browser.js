// tabs context menu
(function() {

Components.utils.import("resource://gre/modules/Services.jsm");
function $(id){
  if (typeof id == 'string') {
    return document.getElementById(id);
  } else {
    return id;
  }
}
// Modify element with optional properties
function $M(id, props, eventhandlers) {
  var el = $(id);
  if (props && el) {
    for (var key in props) {
      if (key == "value") {
        el.value = props[key];
      } else if(key == "class" && Services.appinfo.OS != "WINNT") {
        continue;
      } else {
        if(props[key]) {
          el.setAttribute(key, props[key]);
        } else {
          el.removeAttribute(key)
        }
      }
    }
  }
  if (eventhandlers) {
    for (var event in eventhandlers) {
      el.addEventListener(event, eventhandlers[event], false);
    }
  }
  return el;
}
// Create element with optional properties
function $E(tag, props, eventhandlers) {
  const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
  var el = document.createElementNS(XUL_NS, tag);
  return $M(el, props, eventhandlers)
}
var _bundles = Cc["@mozilla.org/intl/stringbundle;1"].
        getService(Ci.nsIStringBundleService).
        createBundle("chrome://cmimprove/locale/browser.properties");
function getString(key){
  return _bundles.GetStringFromName(key);
}
function cmd_cloneTab(){
  tab = TabContextMenu.contextTab;
  if(!tab) {
    return;
  }
  openUILinkIn(tab.linkedBrowser.currentURI.spec, "tab");
}
function cmd_closeRight(){
  tab = TabContextMenu.contextTab;
  if(!tab) {
    return;
  }
  var right = tab.nextElementSibling;
  while(right){
    tab = right;
    right = tab.nextElementSibling;
    if(tab.tagName == "tab") {
      gBrowser.removeTab(tab);
    }
  }
}
function cmd_bookmark(){
  tab = TabContextMenu.contextTab;
  if(!tab) {
    return;
  }
  var tfID = Application.prefs.getValue("extensions.cmimprove.bookmarks.parentFolder",PlacesUtils.unfiledBookmarksFolderId);
  PlacesCommandHook.bookmarkPage(tab.linkedBrowser,tfID,true);
}
function cmd_reloadSkipCache(){
  tab = TabContextMenu.contextTab;
  if(!tab) {
    return;
  }
  const reloadFlags = Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY | Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE;
  tab.linkedBrowser.reloadWithFlags(reloadFlags);
}
var tcm = {
  init : function(){
    try{
      if (!Services.prefs.getBoolPref("extensions.cmimprove.features.tabcontextmenu.enable", true)) {
        return;
      }
    } catch(e) {}
    var parent = $("tabContextMenu")
    if(!parent) {
      return;
    }
    //remove all menuseparator
    var arr = parent.getElementsByTagName("menuseparator");
    try {
      for(var i = arr.length; i > 0;) {
        parent.removeChild(arr[--i]);
      }
    } catch(e) {}
    // Add new menu
    var btn_new = $E("menuitem", { 
                      id: "ce_context_newTab" ,
                      label: getString("cp.tabs.new") ,
                      accesskey: "N" ,
                      key: "key_newNavigatorTab" ,
                      command: "cmd_newNavigatorTab",
                      style:"list-style-image: url('chrome://cmimprove/skin/tabs/menuicon.png');-moz-image-region: rect(0px, 16px, 16px, 0px);",
                      class:"menuitem-iconic",
                    });
    var btn_clone = $E("menuitem",{ 
                      id: "ce_context_cloneTab" ,
                      label: getString("cp.tabs.clone") ,
                    },{command: cmd_cloneTab});
    var btn_closeRight = $E("menuitem",{ 
                      id: "ce_context_closeRight" ,
                      label: getString("cp.tabs.close.right"),
                    },{command: cmd_closeRight});
    var btn_bookmark = $E("menuitem",{ 
                      id: "ce_context_bookmark" ,
                      label: getString("cp.tabs.bookmark") ,
                      key: "addBookmarkAsKb" ,
                      style:"list-style-image: url('chrome://cmimprove/skin/tabs/menuicon.png');-moz-image-region: rect(0px, 80px, 16px, 64px);",
                      class:"menuitem-iconic",
                    },{command: cmd_bookmark});
    //show all
    var arr = [btn_new//[new]
              ,btn_clone//[clone]
              ,$E("menuseparator")  //--------------------
              ,$M("context_pinTab",{ 
                      style:"list-style-image: url('chrome://cmimprove/skin/tabs/menuicon.png');-moz-image-region: rect(0px, 32px, 16px, 16px);",
                      class:"menuitem-iconic"})//pin        
              ,$M("context_unpinTab",{ 
                      style:"list-style-image: url('chrome://cmimprove/skin/tabs/menuicon.png');-moz-image-region: rect(0px, 48px, 16px, 32px);",
                      class:"menuitem-iconic"})//unpin         
              ,$("context_tabViewMenu")//moveTo      
              ,$("context_openTabInWindow")//moveWin     
              ,$E("menuseparator")  //--------------------
              ,$M("context_closeTab",{ 
                      style:"list-style-image: url('chrome://cmimprove/skin/tabs/menuicon.png');-moz-image-region: rect(0px, 64px, 16px, 48px);",
                      class:"menuitem-iconic",
                      key:"key_close" })//close       
              ,$("context_closeOtherTabs")//closeOtherTabs  
              ,btn_closeRight//[closeRight]
              ,$M("context_undoCloseTab",{ key:"key_undoCloseTab" })//undoClose
              ,$E("menuseparator")  //--------------------
              ,btn_bookmark//[bookmark]
              ,$M("context_bookmarkAllTabs",{ label: getString("cp.tabs.bookmark.all") })//bookmarkAll 
              ,$M("context_reloadTab",{ 
                      oncommand:null,
                      style:"list-style-image: url('chrome://cmimprove/skin/tabs/menuicon.png');-moz-image-region: rect(0px, 96px, 16px, 80px);",
                      class:"menuitem-iconic" }
                   ,{ command:cmd_reloadSkipCache })//reload      
              ,$("context_reloadAllTabs")//reloadAll   
    ]
    var anchor = $E("menuseparator",{ hidden: "true" });
    parent.insertBefore(anchor,parent.firstChild);
    arr.forEach(function(m){
      if(m) {
        parent.insertBefore(m,anchor);
      }
    });
  },
}
window.addEventListener('load', tcm.init, false);

})();
