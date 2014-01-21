(function() {
function $(id) {return document.getElementById(id);}
var _bundles = Cc["@mozilla.org/intl/stringbundle;1"].
        getService(Ci.nsIStringBundleService).
        createBundle("chrome://cmimprove/locale/browser.properties");
function getString(key) {
  return _bundles.GetStringFromName(key);
}

var cmImprove_BM = {
  handleEvent: function (aEvent) {
    switch (aEvent.type) {
      case "load":
        this.init();
        break;
      case "unload":
        this.uninit();
        break;
      case "popupshowing":
        this.bookmarksPopup_popupshowing();
        break;

    }
  },
  get bookmarksPopup() {
    delete this.bookmarksPopup;
    return this.bookmarksPopup = $("BMB_bookmarksPopup");
  },
  bookmarksPopup_popupshowing: function() {
    var item_t = $("BMB_viewBookmarksToolbar");
    item_t && item_t.setAttribute("label", getString("menu.bookmarksToolbar"));
    var item_s = $("cm_menu_bookmarksSidebar");
    item_s && item_s.setAttribute("label", getString("menu.bookmarksSidebar"));
  },
  showBookmarkToolbar: function() {
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
    if ($("PersonalToolbar")) {
       setToolbarVisibility($("PersonalToolbar"), true);
    }
  },
  init: function() {
    if (window.PlacesStarButton) {
      PlacesStarButton.onClick = function (aEvent) {
        var tfID = PlacesUtils.unfiledBookmarksFolderId;
        var showUI = true;
        try {
          tfID = Services.prefs.getIntPref("extensions.cmimprove.bookmarks.parentFolder");
          if (tfID == -1) {
            tfID = Services.prefs.getIntPref("extensions.cmimprove.bookmarks.add.defaultFolder");
          }
          showUI = (this._itemIds.length > 0) || Application.prefs.getValue("extensions.cmimprove.bookmarks.add.showEditUI", false);
          if (!showUI)
            tfID = PlacesUtils.unfiledBookmarksFolderId;
          var folderTitle = PlacesUtils.bookmarks.getItemTitle(tfID)
        } catch(e) {
          tfID = PlacesUtils.unfiledBookmarksFolderId;
          showUI = true;;
        }
        if (aEvent.button == 0 && !this._pendingStmt) {
          PlacesCommandHook.bookmarkCurrentPage(showUI, tfID);
        }
        aEvent.stopPropagation();
      }
      PlacesStarButton.__defineGetter__("_unstarredTooltip", function() {
        delete this._unstarredTooltip;
        return this._unstarredTooltip =
          getString("starButtonOff.tooltip");
      });
    } else {
      BookmarkingUI.onCommand = function (aEvent) {
        var tfID = PlacesUtils.unfiledBookmarksFolderId;
        var showUI = true;
        try {
          tfID = Services.prefs.getIntPref("extensions.cmimprove.bookmarks.parentFolder");
          if (tfID == -1) {
            tfID = Services.prefs.getIntPref("extensions.cmimprove.bookmarks.add.defaultFolder");
          }
          showUI = (this._itemIds.length > 0) || Application.prefs.getValue("extensions.cmimprove.bookmarks.add.showEditUI", false);
          if (!showUI)
            tfID = PlacesUtils.unfiledBookmarksFolderId;
          var folderTitle = PlacesUtils.bookmarks.getItemTitle(tfID)
        } catch(e) {
          tfID = PlacesUtils.unfiledBookmarksFolderId;
          showUI = true;;
        }
        if (aEvent.button == 0 && !this._pendingStmt) {
          PlacesCommandHook.bookmarkCurrentPage(showUI, tfID);
        }
        aEvent.stopPropagation();
      }
      BookmarkingUI.__defineGetter__("_unstarredTooltip", function() {
        delete this._unstarredTooltip;
        return this._unstarredTooltip =
          getString("starButtonOff.tooltip");
      });
    }
    StarUI.panel.addEventListener("popupshown", function () {
      StarUI._element("editBookmarkPanelTitle").value = getString("editBookmarkPanel.addBookmarkTitle");
      var footer = document.getAnonymousElementByAttribute(StarUI.panel, "class", "panel-inner-arrowcontentfooter");
      var link = document.getAnonymousElementByAttribute(footer, "anonid", "promo-link");
      link.setAttribute("href", "http://www.firefox.com.cn/sync/");
    }, false);

    this.bookmarksPopup && this.bookmarksPopup.addEventListener("popupshowing", this, false);

    gEditItemOverlay.tempContainer = 0;
    var _onFolderMenuListCommand = gEditItemOverlay.onFolderMenuListCommand.bind(gEditItemOverlay);
    gEditItemOverlay.onFolderMenuListCommand = (function(event) {
      _onFolderMenuListCommand(event);
      var t = event.target.tagName;
      if (event.target.id == "editBMPanel_chooseFolderMenuItem")
        return;
      gEditItemOverlay.tempContainer = gEditItemOverlay._getFolderIdFromMenuList();
    }).bind(gEditItemOverlay);

    StarUI.panel.addEventListener("popupshowing", function(event) {
      if (event.target.id == "editBookmarkPanel")
        gEditItemOverlay.tempContainer = 0;
    }, false);
    StarUI.panel.addEventListener("popuphiding", function(event) {
      if (event.target.id == "editBookmarkPanel" && gEditItemOverlay.tempContainer && !StarUI._actionOnHide)
        Application.prefs.setValue("extensions.cmimprove.bookmarks.add.defaultFolder", gEditItemOverlay.tempContainer)
    }, false);

    this.showBookmarkToolbar();
  },
  uninit: function() {
    this.bookmarksPopup && this.bookmarksPopup.removeEventListener("popupshowing", this, false);
  },
}

window.addEventListener('load'  , cmImprove_BM, false)
window.addEventListener('unload', cmImprove_BM, false)
})();
