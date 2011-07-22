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
		if(isFirefox4()) {
			Components.utils.import("resource://gre/modules/AddonManager.jsm");
			AddonManager.getAddonByID("addon-notification@mozillaonline.com", function(addon) {
			addon.uninstall();
			});
		} else {
			var em = Components.classes["@mozilla.org/extensions/manager;1"]  
					.getService(Components.interfaces.nsIExtensionManager);
			em.uninstallItem("addon-notification@mozillaonline.com");			
		}
	} catch (e) {}
}

function isFirefox4() {
	return typeof Application.getExtensions != "undefined";
}