
var MozCnFeedback = {
	el: function(id) {
		if (typeof id == 'string')
			return document.getElementById(id);
		else
			return id;
	},
	get panel() {
		delete this.panel;
		return this.panel = this.el("moz-cn-feedback-popup");
	},
	get spanel() {
		delete this.spanel;
		return this.spanel = this.el("moz-cn-feedback-success");
	},
	get toolbarbutton() {
		delete this.toolbarbutton;
		if(this.el('moz_cn_feedback'))
			return this.toolbarbutton = this.el('moz_cn_feedback');
	},

	show_url: function() {
		if (el("moz-cn-feedback-checkbox").checked) {
			el('moz-cn-feedback-url').disabled = "false";
		} else {
			el('moz-cn-feedback-url').disabled = "true";
		}
	},

	show_panel: function() {
		if (this.panel.state === "open" || this.panel.state === "showing") {
			this.panel.hidePopup();
		}
		this.panel.openPopup(this.toolbarbutton, "after_end", -15, 0, false, false);
	},

	show_success: function() {
		if (this.spanel.state === "open" || this.spanel.state === "showing") {
			this.spanel.hidePopup();
		}
		this.close_panel();
		this.spanel.openPopup(this.toolbarbutton, "after_end", -15, 0, false, false);
	},

	reset_button: function() {
		MozCnFeedback.el("moz-cn-feedback-messp").style.display = "none";
		MozCnFeedback.el("moz-cn-feedback-messf").style.display = "none";
		MozCnFeedback.el("moz-cn-feedback-submit").style.display = "block";
		MozCnFeedback.el("moz-cn-feedback-comment").reset();
		MozCnFeedback.el("moz-cn-feedback-contact").reset();
	},

	close_panel: function() {
		MozCnFeedback.reset_button();
		if (this.panel.state === "open" || this.panel.state === "showing") {
			this.panel.hidePopup();
		}
	},

	close_success: function() {
		if (this.spanel.state === "open" || this.spanel.state === "showing") {
			this.spanel.hidePopup();
		}
	},

	send_request:function() {
		if (this.el("moz-cn-feedback-url").disabled) {
			var content = 'comment=' + this.el("moz-cn-feedback-comment").value + '&contact=' + this.el("moz-cn-feedback-contact").value;
		} else {
			var content = 'url=' + this.el("moz-cn-feedback-url").value + '&comment=' + this.el("moz-cn-feedback-comment").value + '&contact=' + this.el("moz-cn-feedback-contact").value;
		}
		var url = "http://i.g-fox.cn/apply/feed_addon.php";
		var request = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
		request.onload = function(aEvent) {
			MozCnFeedback.show_success();
		};
		request.onerror = function(aEvent) {
			MozCnFeedback.el("moz-cn-feedback-messp").style.display = "none";
			MozCnFeedback.el("moz-cn-feedback-messf").style.display = "block";
		};
		request.open("POST", url, true);
		request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		request.send(content);
	},

	submit:function() {
		this.send_request();
		this.el("moz-cn-feedback-submit").style.display = "none";
		this.el("moz-cn-feedback-messp").style.display = "block";
	},

	resubmit:function() {
		MozCnFeedback.el("moz-cn-feedback-messf").style.display = "none";
		this.el("moz-cn-feedback-messp").style.display = "block";
		this.send_request();
	}
};
