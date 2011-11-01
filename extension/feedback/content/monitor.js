
(function() {

	var FeedbackListener = {
		onLocationChange: function(webProgress, request, uri) {
			document.getElementById("moz-cn-feedback-url").value = uri.spec;
			MozCnFeedback.reset_button();
		},
	};

	function installButton() {
		try{
			var firefoxnav = document.getElementById("nav-bar");
			var newSet = firefoxnav.currentSet + "";
			if(newSet.indexOf("moz_cn_feedback") == -1){
				newSet = newSet + ",moz_cn_feedback";
				firefoxnav.setAttribute("currentset", newSet);
				firefoxnav.currentSet = newSet;
				document.persist("nav-bar", "currentset");
				try{
					BrowserToolboxCustomizeDone(true);
				}catch(ex){}
			}
			setFeedbackPref(true);
		} catch(e) {}
	}

	function feedback_init() {
		var navbar = document.getElementById("nav-bar");
		if (navbar != null){
			if (!getFeedbackPref()) {
				installButton();
			}
			MozCnFeedback.panel.addEventListener("popupshown", function(e) {
				document.getElementById("moz-cn-feedback-url").value = gBrowser.contentDocument.location;
				gBrowser.addProgressListener(FeedbackListener);
			}, false );
			MozCnFeedback.panel.addEventListener("popuphidden", function(e) {
				gBrowser.removeProgressListener(FeedbackListener);
			}, false );
		}
	}

	function getFeedbackPref() {
		return Application.prefs.getValue("extensions.feedback@mozillaonline.com.installed", false);
	}

	function setFeedbackPref(val) {
		try{
			Application.prefs.setValue("extensions.feedback@mozillaonline.com.installed", val);
		}catch(e){}
	}
	window.addEventListener("load", feedback_init, false);

})();