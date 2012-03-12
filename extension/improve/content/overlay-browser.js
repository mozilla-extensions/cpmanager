(function() {
var cmImprove = {
  el: function(id) {
    if (typeof id == 'string')
      return document.getElementById(id);
    else
      return id;
  },
  get bookmarksPopup() {
    return this.el("BMB_bookmarksPopup");
  },
  
  get _bundles() {
    return Cc["@mozilla.org/intl/stringbundle;1"].
           getService(Ci.nsIStringBundleService).
           createBundle("chrome://cmimprove/locale/browser.properties");
  },
  bookmarksPopup_popupshowing : function() {
    var item_t = cmImprove.el("BMB_viewBookmarksToolbar");
    item_t && item_t.setAttribute("label",cmImprove._bundles.GetStringFromName("menu.bookmarksToolbar"));
    var item_s = cmImprove.el("cm_menu_bookmarksSidebar");
    item_s && item_s.setAttribute("label",cmImprove._bundles.GetStringFromName("menu.bookmarksSidebar"));
  },
  init : function(){
    PlacesStarButton.onClick = function (aEvent){
      if (aEvent.button == 0 && !this._pendingStmt) {
        PlacesCommandHook.bookmarkCurrentPage(true,PlacesUtils.toolbarFolderId);
      }
      aEvent.stopPropagation();
    }
    PlacesStarButton.__defineGetter__("_unstarredTooltip", function(){
      delete this._unstarredTooltip;
      return this._unstarredTooltip =
        cmImprove._bundles.GetStringFromName("starButtonOff.tooltip");
    });
    
    StarUI.panel.addEventListener("popupshown", function () {
      StarUI._element("editBookmarkPanelTitle").value = cmImprove._bundles.GetStringFromName("editBookmarkPanel.addBookmarkTitle");
      var footer = document.getAnonymousElementByAttribute(StarUI.panel, "class", "panel-inner-arrowcontentfooter");
      var link = document.getAnonymousElementByAttribute(footer, "anonid", "promo-link");
      link.setAttribute("href", "http://www.firefox.com.cn/sync/");
    },false);
    
    // If pref "initialized" has been set to True, this means it's not a new profile.
    var prefs = Application.prefs;
    if (prefs.getValue("extensions.cpmanager@mozillaonline.com.initialized", false)) {
      return;
    }
    
    if (!prefs.getValue("extensions.cpmanager@mozillaonline.com.show_bookmark_toolbar", false)) {
      return;
    }

    prefs.setValue("extensions.cpmanager@mozillaonline.com.show_bookmark_toolbar", false);
    // Show bookmark toolbar
    // Only affect FF4.0 or newer version
    if (window.setToolbarVisibility && document.getElementById("PersonalToolbar")) {
               setToolbarVisibility(document.getElementById("PersonalToolbar"), true);
    } 

    cmImprove.bookmarksPopup && cmImprove.bookmarksPopup.addEventListener("popupshowing",cmImprove.bookmarksPopup_popupshowing,false)
  },
  uninit : function(){
    cmImprove.bookmarksPopup && cmImprove.bookmarksPopup.removeEventListener("popupshowing",cmImprove.bookmarksPopup_popupshowing,false)
  }
}

window.addEventListener('load', cmImprove.init, false)
window.addEventListener('unload', cmImprove.uninit, false)
})();
