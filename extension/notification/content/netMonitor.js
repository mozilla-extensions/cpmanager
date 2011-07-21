(function() {
	var Cc = Components.classes;
	var Ci = Components.interfaces;
	var Cu = Components.utils;

	var imgContentType = {
		'image/jpg': 1,
    	'image/jpeg': 1,
    	'image/gif': 1,
    	'image/png': 1,
    	'image/bmp': 1
	};

	var imgExtensions = {
		'.jpg': 1,
		'.jpeg': 1,
		'.gif': 1,
		'.png': 1,
		'.bmp': 1
	};

	function isResponseImage(httpChannel) {
		var result = false;
		// check Content-Type first.
		try {
			var contentType = httpChannel.getResponseHeader('Content-Type');
			result = !!contentType && !!imgContentType[contentType.toLowerCase()];
		} catch (err) {}

		// check extension
		if (!result) {
			var suffix = httpChannel.URI.spec.substring(httpChannel.URI.spec.length - 5);
			result = !!imgExtensions[suffix];
			if (!result) {
				suffix = suffix.substring(1);
				result = !!imgExtensions[suffix];
			}
		}

		return result;
	}

	var httpObserver = Cc['@mozilla.org/notifier-http-observer;1'].getService().wrappedJSObject;

	var netHttpObserver = {
		registerObserver: function() {
			httpObserver.addObserver(this, 'notifier-http-event', false);
		},

		unregisterObserver: function() {
			httpObserver.removeObserver(this, 'notifier-http-event');
		},

		// nsISupports
		QueryInterface: function(iid) {
			if (iid.equals(Ci.nsISupports) ||
				iid.equals(Ci.nsIObserver)) {
				return this;
			}

			throw Cr.NS_ERROR_NO_INTERFACE;
		},

		// nsIObserver
		observe: function(subject, topic, data) {
			try {
				if (!(subject instanceof Ci.nsIHttpChannel))
					return;

				var httpChannel = subject.QueryInterface(Ci.nsIHttpChannel);
				var win = MOA.Lib.getWindowForRequest(httpChannel);
				var tab = win ? MOA.Lib.getTabIdForWindow(win) : null;
				switch (topic) {
					case 'http-on-modify-request':
						this.onModifyRequest(httpChannel);
						break;
					case 'http-on-examine-response':
						this.onExamineResponse(httpChannel);
						break;
					case 'http-on-examine-cached-response':
						this.onExamineCachedResponse(httpChannel);
						break;
				}
			} catch (err) {
				MOA.log(err);
			}
		},

		onModifyRequest: function(httpChannel) {
			return;

			var win = MOA.Lib.getWindowForRequest(httpChannel);
			var tabId = win ? MOA.Lib.getTabIdForWindow(win) : null;

			if (null == tabId) {
				// MOA.log('Tab is null: ' + httpChannel.URI.spec);
				return;
			}

			var info = {
				win: win,
				tabId: tabId,
				isWindowURI: httpChannel.loadFlags & Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI,
				isDocumentURI: httpChannel.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI,
				isImage: isResponseImage(httpChannel)
			};

			MOA.RuleCenter.checkAndShow(httpChannel, info);
		},

		_examineResponse: function(httpChannel) {
			var win = MOA.Lib.getWindowForRequest(httpChannel);
			var tabId = win ? MOA.Lib.getTabIdForWindow(win) : null;

			if (null == tabId) {
				// MOA.log('Tab is null: ' + httpChannel.URI.spec);
				return;
			}

			// 304 for picture not modified.
			var responseStatus = httpChannel.responseStatus;
			if (200 != responseStatus && 304 != responseStatus) {
				// MOA.log('Status is: ' + responseStatus + ', uri: ' + httpChannel.URI.spec);
				return;
			}

			var info = {
				win: win,
				tabId: tabId,
				isWindowURI: httpChannel.loadFlags & Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI,
				isDocumentURI: httpChannel.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI,
				isImage: isResponseImage(httpChannel)
			};

			MOA.RuleCenter.checkAndShow(httpChannel, info);
		},

		onExamineCachedResponse: function(httpChannel) {
			this._examineResponse(httpChannel);
		},

		onExamineResponse: function(httpChannel) {
			this._examineResponse(httpChannel);
		}
	};

	var progListener = {
		QueryInterface: function(iid) {
			if (iid.equals(Ci.nsISupports) ||
				iid.equals(Ci.nsISupportWeakReference) ||
				iid.equals(Ci.nsIWebProgressListener)) {
				return this;
			}

			throw Cr.NS_ERROR_NO_INTERFACE;
		},

		onStateChange: function() {},
		onProgressChange: function() {},
		onStatusChange: function() {},
		onSecurityChange: function() {},
		onLocationChange: function(webProgess, request, uri) {
			MOA.Notification.showNotification(webProgess);
		},

		handleEvent: function(event) {
			MOA.Notification.onTabClose(event.target.linkedPanel);
		}
	};

	window.addEventListener('load', function(evt) {
		netHttpObserver.registerObserver();
		// do not use any mask which cause an "error" on Firefox5:
		// Error: gBrowser.addProgressListener was called with a second argument, which is not supported. See bug 608628.
		// Source: chrome://browser/content/tabbrowser.xml
		// Line: 1840
		gBrowser.addProgressListener(progListener/*, Ci.nsIWebProgress.NOTIFY_LOCATION*/);
		gBrowser.tabContainer.addEventListener('TabClose', progListener, false);

		var prefs = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch).QueryInterface(Ci.nsIPrefService);
		if (prefs.getCharPref('general.useragent.locale') != 'zh-CN') {
			MOA.debug('general.useragent.locale is not zh-CN, do not show daily quick tip.');
			return;
		}

		// Set a interval, make sure that page is loaded and star-button is shown.
		window.setTimeout(function() {
			// MOA.Notification.showFunctionTip();
			MOA.Notification.showDayTip();
		}, 1000 * 15);
	}, false);

	window.addEventListener('unload', function(evt) {
		netHttpObserver.unregisterObserver();
	    gBrowser.removeProgressListener(progListener);
		gBrowser.tabContainer.removeEventListener('TabClose', progListener, false);
	}, false);

})();
