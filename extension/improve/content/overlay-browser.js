
XPCOMUtils.defineLazyGetter(PlacesStarButton, "_cm_bundle", function() {
  const IMPROVE_STRING_BUNDLE_URI = "chrome://cmimprove/locale/browser.properties";
  return Cc["@mozilla.org/intl/stringbundle;1"].
         getService(Ci.nsIStringBundleService).
         createBundle(IMPROVE_STRING_BUNDLE_URI);
});
PlacesStarButton.onClick = function (aEvent){
    if (aEvent.button == 0 && !this._pendingStmt) {
      PlacesCommandHook.bookmarkCurrentPage(true,PlacesUtils.toolbarFolderId);
    }
    aEvent.stopPropagation();
}
PlacesStarButton.__defineGetter__("_unstarredTooltip", function(){
  delete this._unstarredTooltip;
  return this._unstarredTooltip =
    PlacesStarButton._cm_bundle.GetStringFromName("starButtonOff.tooltip");
});

XPCOMUtils.defineLazyGetter(StarUI, "_cm_bundle", function() {
  const IMPROVE_STRING_BUNDLE_URI = "chrome://cmimprove/locale/browser.properties";
  return Cc["@mozilla.org/intl/stringbundle;1"].
         getService(Ci.nsIStringBundleService).
         createBundle(IMPROVE_STRING_BUNDLE_URI);
});
StarUI.__doShowEditBookmarkPanel = StarUI._doShowEditBookmarkPanel;
StarUI._doShowEditBookmarkPanel = function(aItemId, aAnchorElement, aPosition){
  StarUI.__doShowEditBookmarkPanel(aItemId, aAnchorElement, aPosition);
  this._element("editBookmarkPanelTitle").value = StarUI._cm_bundle.GetStringFromName("editBookmarkPanel.addBookmarkTitle");
}
/*
  <menupopup id="bookmarksMenuPopup">
    <menuitem id="cm_menu_bookmarksSidebar"
      key="viewBookmarksSidebarKb"
      observes="viewBookmarksSidebar"
      accesskey="&bookmarksButton.accesskey;" >
    </menuitem>

  </menupopup>
*/
