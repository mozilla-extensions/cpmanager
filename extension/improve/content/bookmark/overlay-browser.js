(function() {
var cpmPrefs = Cu.import("resource://cmtracking/Prefs.jsm", {}).CPManagerPrefs;

var cmImprove_BM = {
  handleEvent: function (aEvent) {
    switch (aEvent.type) {
      case "load":
        this.init();
        break;
    }
  },
  showBookmarkToolbar: function() {
    if (Services.vc.compare(Services.appinfo.version, "47.0") >= 0) {
      return;
    }

    // If pref "initialized" has been set to True, this means it's not a new profile.
    var prefs = cpmPrefs.prefs;
    if (prefs.getValue("extensions.cpmanager@mozillaonline.com.initialized", false)) {
      return;
    }

    if (!prefs.getValue("extensions.cpmanager@mozillaonline.com.show_bookmark_toolbar", false)) {
      return;
    }

    prefs.setValue("extensions.cpmanager@mozillaonline.com.show_bookmark_toolbar", false);
    // Show bookmark toolbar
    personalToolbar = document.getElementById("PersonalToolbar");
    if (personalToolbar) {
       setToolbarVisibility(personalToolbar, true);
    }
  },
  init: function() {
    this.showBookmarkToolbar();
  }
}

window.addEventListener('load'  , cmImprove_BM, false)
})();
