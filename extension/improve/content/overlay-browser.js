(function() {
  //common
var cmImprove = {
  el: function(id) {
    if (typeof id == 'string')
      return document.getElementById(id);
    else
      return id;
  },
  get _bundles() {
    delete this._bundles;
    return this._bundles = Cc["@mozilla.org/intl/stringbundle;1"].
        getService(Ci.nsIStringBundleService).
        createBundle("chrome://cmimprove/locale/browser.properties");
  },
}
  //relating to cert error
var cmImprove_CE = {
  get _vc() {
    delete this._vc;
    return this._vc = Cc['@mozilla.org/xpcom/version-comparator;1'].
        createInstance(Ci.nsIVersionComparator);
  },
  iFrameCertFix: function(evt) {
    var contentDoc = evt.target;
    if (contentDoc.documentURI.match(/^about:certerror/) && contentDoc.defaultView !== contentDoc.defaultView.top && !contentDoc.querySelector('#exceptionDialogButton')) {
      var iframeCert = Application.prefs.getValue("extensions.cmimprove.iframe_cert_fix.whitelist", "").split(',');
      if (iframeCert.some(function(host) contentDoc.location.host == host )) {
/*
        <div id="expertContent" collapsed="true">
          <h2 onclick="toggle('expertContent');" id="expertContentHeading">&certerror.expert.heading;</h2>
          <div>
            <p>&certerror.expert.content;</p>
            <p>&certerror.expert.contentPara2;</p>
            <button id='exceptionDialogButton'>&certerror.addException.label;</button>
          </div>
        </div>
*/
        var div = contentDoc.createElement('div');
        div.id = 'expertContent';
        div.setAttribute('collapsed', 'true');
        contentDoc.querySelector('#technicalContent').parentNode.appendChild(div);
        contentDoc.querySelector('#expertContent').innerHTML = ["<h2 onclick=\"toggle('expertContent');\" id=\"expertContentHeading\">",
            cmImprove._bundles.GetStringFromName("certerror.expert.heading"),
            "</h2><div><p>",
            cmImprove._bundles.GetStringFromName("certerror.expert.content"),
            "</p><p>",
            cmImprove._bundles.GetStringFromName("certerror.expert.contentPara2"),
            "</p><button id='exceptionDialogButton'>",
            cmImprove._bundles.GetStringFromName("certerror.addException.label"),
            "</button></div>"].join('');
      }
    }
    if (contentDoc.documentURI.match(/^about:certerror/) && contentDoc.defaultView !== contentDoc.defaultView.top && contentDoc.querySelector('#expertContent').hasAttribute('hidden')) {
      var iframeCert = Application.prefs.getValue("extensions.cmimprove.iframe_cert_fix.whitelist", "").split(',');
      if (iframeCert.some(function(host) contentDoc.location.host == host )) {
        contentDoc.querySelector('#expertContent').removeAttribute('hidden');
      }
    }
  },
  init : function(){
    if (cmImprove_CE._vc.compare(Application.version, '11.0') >= 0) {
      cmImprove.el('appcontent').addEventListener('DOMContentLoaded', cmImprove_CE.iFrameCertFix, false);
    }
  },
  uninit : function(){
    if (cmImprove_CE._vc.compare(Application.version, '11.0') >= 0) {
      cmImprove.el('appcontent').removeEventListener('DOMContentLoaded', cmImprove_CE.iFrameCertFix, false);
    }
  },
}
  //relating to bookmark
var cmImprove_BM = {
  get bookmarksPopup() {
    delete this.bookmarksPopup;
    return this.bookmarksPopup = cmImprove.el("BMB_bookmarksPopup");
  },
  bookmarksPopup_popupshowing : function() {
    var item_t = cmImprove.el("BMB_viewBookmarksToolbar");
    item_t && item_t.setAttribute("label",cmImprove._bundles.GetStringFromName("menu.bookmarksToolbar"));
    var item_s = cmImprove.el("cm_menu_bookmarksSidebar");
    item_s && item_s.setAttribute("label",cmImprove._bundles.GetStringFromName("menu.bookmarksSidebar"));
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
    if (window.setToolbarVisibility && cmImprove.el("PersonalToolbar")) {
               setToolbarVisibility(cmImprove.el("PersonalToolbar"), true);
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
        cmImprove._bundles.GetStringFromName("starButtonOff.tooltip");
    });

    StarUI.panel.addEventListener("popupshown", function () {
      StarUI._element("editBookmarkPanelTitle").value = cmImprove._bundles.GetStringFromName("editBookmarkPanel.addBookmarkTitle");
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
window.addEventListener('load'  , cmImprove_CE.init, false)
window.addEventListener('unload', cmImprove_CE.uninit, false)
})();
