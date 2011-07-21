var addonnotification = {
	onLoad: function() {
		// initialization code
		this.initialized = true;
		this.strings = document.getElementById("addonnotification-strings");
		_uninstallOldNotification();
	},

	onMenuItemCommand: function(e) {
    	var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                                  .getService(Components.interfaces.nsIPromptService);
		promptService.alert(window, this.strings.getString("helloMessageTitle"),
                                this.strings.getString("helloMessage"));
	},

	onToolbarButtonCommand: function(e) {
		// just reuse the function above.  you can change this, obviously!
	 	addonnotification.onMenuItemCommand(e);
	}
};

window.addEventListener("load", addonnotification.onLoad, false);

function _uninstallOldNotification() {
	try {
		AddonManager.getAddonByID("addon-notification@mozillaonline.com", function(addon) {
		addon.uninstall();
		});
	} catch (e) {}
}
