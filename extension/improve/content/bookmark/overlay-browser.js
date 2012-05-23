//bookmark
(function() {
function $(id){return document.getElementById(id);}
var _bundles = Cc["@mozilla.org/intl/stringbundle;1"].
        getService(Ci.nsIStringBundleService).
        createBundle("chrome://cmimprove/locale/browser.properties");
function getString(key){
  return _bundles.GetStringFromName(key);
}

var cmImprove_BM = {
  get bookmarksPopup() {
    delete this.bookmarksPopup;
    return this.bookmarksPopup = $("BMB_bookmarksPopup");
  },
  bookmarksPopup_popupshowing : function() {
    var item_t = $("BMB_viewBookmarksToolbar");
    item_t && item_t.setAttribute("label",getString("menu.bookmarksToolbar"));
    var item_s = $("cm_menu_bookmarksSidebar");
    item_s && item_s.setAttribute("label",getString("menu.bookmarksSidebar"));
  },
  showBookmarkToolbar : function() {
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
    if (window.setToolbarVisibility && $("PersonalToolbar")) {
               setToolbarVisibility($("PersonalToolbar"), true);
    }
  },
  init : function(){
    PlacesStarButton.onClick = function (aEvent){
      var tfID = Application.prefs.getValue("extensions.cmimprove.bookmarks.parentFolder",PlacesUtils.unfiledBookmarksFolderId);
      var showUI = (this._itemIds.length > 0) || Application.prefs.getValue("extensions.cmimprove.bookmarks.add.showEditUI",false);
      if (aEvent.button == 0 && !this._pendingStmt) {
        PlacesCommandHook.bookmarkCurrentPage(showUI,tfID);
      }
      aEvent.stopPropagation();
    }
    PlacesStarButton.__defineGetter__("_unstarredTooltip", function(){
      delete this._unstarredTooltip;
      return this._unstarredTooltip =
        getString("starButtonOff.tooltip");
    });

    StarUI.panel.addEventListener("popupshown", function () {
      StarUI._element("editBookmarkPanelTitle").value = getString("editBookmarkPanel.addBookmarkTitle");
      var footer = document.getAnonymousElementByAttribute(StarUI.panel, "class", "panel-inner-arrowcontentfooter");
      var link = document.getAnonymousElementByAttribute(footer, "anonid", "promo-link");
      link.setAttribute("href", "http://www.firefox.com.cn/sync/");
    },false);

    cmImprove_BM.bookmarksPopup && cmImprove_BM.bookmarksPopup.addEventListener("popupshowing",cmImprove_BM.bookmarksPopup_popupshowing,false);

    cmImprove_BM.showBookmarkToolbar();
  },
  uninit : function(){
    cmImprove_BM.bookmarksPopup && cmImprove_BM.bookmarksPopup.removeEventListener("popupshowing",cmImprove_BM.bookmarksPopup_popupshowing,false);
  },
}

window.addEventListener('load'  , cmImprove_BM.init, false)
window.addEventListener('unload', cmImprove_BM.uninit, false)
})();
