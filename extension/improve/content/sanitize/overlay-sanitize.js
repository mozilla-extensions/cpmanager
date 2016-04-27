window.addEventListener('load', function() {  
  var cpmPrefs = Components.utils.import("resource://cmtracking/Prefs.jsm", {}).CPManagerPrefs;

  if (cpmPrefs.prefs.getValue("extensions.cmimprove.features.sanitize.show", false))
    return;
  cpmPrefs.prefs.setValue("extensions.cmimprove.features.sanitize.show", true);
  setTimeout(() => {
    gSanitizePromptDialog.showItemList();
  }, 100);
}, false)
