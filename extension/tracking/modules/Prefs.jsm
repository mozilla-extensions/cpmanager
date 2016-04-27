var EXPORTED_SYMBOLS = ["CPManagerPrefs"];

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

var CPManagerPrefs = {
  get prefs() {
    delete this.prefs;
    try {
      Cu.import("resource://gre/modules/Preferences.jsm");
      return this.prefs = {
        getValue: function(aName, aValue) {
          return Preferences.get(aName, aValue);
        },
        setValue: function(aName, aValue) {
          return Preferences.set(aName, aValue);
        }
      }
    } catch(ex) {
      return this.prefs = Cc["@mozilla.org/fuel/application;1"].
        getService(Ci.fuelIApplication).prefs;
    }
  }
}
