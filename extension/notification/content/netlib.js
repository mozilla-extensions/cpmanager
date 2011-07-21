(function() {
	var ns = MOA.ns('Lib');
	var Ci = Components.interfaces;
	var Cc = Components.classes;

	// FIXME can not get tab for iframe
	ns.getTabIDForHttpChannel = function (oHttpChannel) {
		if (!gBrowser)
			return null;

		try {
			if (oHttpChannel.notificationCallbacks) {
				var interfaceRequestor = oHttpChannel.notificationCallbacks.QueryInterface(Ci.nsIInterfaceRequestor);
				var targetDoc = interfaceRequestor.getInterface(Ci.nsIDOMWindow).document;

				var tab = null;
				var targetBrowserIndex = gBrowser.getBrowserIndexForDocument(targetDoc);

				// handle the case where there was no tab associated with the request (rss etc.)
				if (targetBrowserIndex != -1) {
					tab = gBrowser.tabContainer.childNodes[targetBrowserIndex];
				} else {
					return null;
				}

				return tab.linkedPanel;
			}
		} catch (ex) {
			return null;
		}

		return null;
	};

	ns.getRequestWebProgress = function(request) {
		try {
			if (request && request.notificationCallbacks)
				return request.notificationCallbacks.getInterface(Ci.nsIWebProgress);
		} catch (err ) {
			// MOA.log(err);
		}

		try {
			if (request && request.loadGroup && request.loadGroup.groupObserver)
				return request.loadGroup.groupObserver.QueryInterface(Ci.nsIWebProgress);
		} catch (err) {
			// MOA.log(err);
		}
	};

	ns.getWindowForRequest = function(request) {
		return this.getWindowForWebProgress(this.getRequestWebProgress(request));
	};

	ns.getWindowForWebProgress = function(webProgress) {
		try {
			if (webProgress)
				return webProgress.DOMWindow;
		} catch (err) {
			// MOA.log(err);
		}

		return null;
	};

	ns.getRootWindow = function(win) {
		for (; win; win = win.parent) {
			if (!win.parent || win == win.parent || !(win.parent instanceof Window))
				return win;
		}

		return null;
	};

	ns.getTabForWindow = function(win) {
		aWindow = this.getRootWindow(win);

		if (!aWindow || !gBrowser.getBrowserIndexForDocument)
			return null;

		try {
			var targetDoc = aWindow.document;

			var tab = null;
			var targetBrowserIndex = gBrowser.getBrowserIndexForDocument(targetDoc);

			if (targetBrowserIndex != -1) {
				tab = gBrowser.tabContainer.childNodes[targetBrowserIndex];
				return tab;
			}
		} catch (err) {
			MOA.log(err);
		}

		return null;
	};

	ns.getTabIdForWindow = function(win) {
		var tab = this.getTabForWindow(win);
		return tab ? tab.linkedPanel : null;
	};

	ns.get = function(id) {
		return document.getElementById(id);
	};

	// extend object
	ns.extend = function(src, target) {
		for (var key in src) {
			target[key] = src[key];
		}
		return target;
	};

	ns.emptyFunction = function() {

	};

	ns.CountDown = function(option) {
		this.option = ns.extend(option, {
			start: 10,
			onStart: ns.emptyFunction,
			onCounting: ns.emptyFunction,
			onFinish: ns.emptyFunction
		});
		this.initialize();
	}

	ns.CountDown.prototype = {
		_count_down_timeout: null,
		current: 0,
		initialize: function() {
			this.reset();
		},

		start: function() {
			this.reset();
			MOA.debug('Start counting down.');
			this.option.onStart();
			var $this = this;
			function ct() {
				MOA.debug('Current counting is: ' + $this.current);
				if (0 == $this.current) {
					MOA.debug('Finish! call onfinish.');
					$this.option.onCounting($this.current);
					$this.option.onFinish();
					return;
				}
				$this.option.onCounting($this.current);
				$this.current--;
				$this._count_down_timeout = window.setTimeout(ct, 1000);
			}
			ct();
		},

		reset: function() {
			this.current = this.option.start;
			window.clearTimeout(this._count_down_timeout);
		},

		destroy: function() {
			this.reset();
			this.option = null;
		}
	};



	ns.isAddonInstalled = function(id) {
		var extensionManager = Cc['@mozilla.org/extensions/manager;1'].getService(Ci.nsIExtensionManager);
		return !!extensionManager.getItemForID(id);
	};

	ns.isAddonEnabled = function(id) {
		var enabledItems = Application.prefs.getValue('extensions.enabledItems', null);
		if (!enabledItems)
			return null;

		var list = enabledItems.split(/[,:]/);
		for (var i = 0, len = list.length; i < len; i++) {
			if (list[i].toLowerCase() === id.toLowerCase())
				return true;
		}

		return false;
	};

	// file should be an array, e.g.: [dir1, dir2, dir3, filename].
	ns.readStrFromProFile = function(file_att) {
		if (typeof file_att.shift != 'function' || file_att.length == 0)
			return '';

		var file = Cc['@mozilla.org/file/directory_service;1']
			.getService(Ci.nsIProperties).get('ProfD', Ci.nsIFile);

		// create directory
		var dir_name = file_att.shift();
		while (file_att.length > 0) {
			file.append(dir_name);
			if (!file.exists() || !file.isDirectory()) {
				return '';
			}

			dir_name = file_att.shift();
		}

		file.append(dir_name);
		if (!file.exists()) {
			return '';
		}

		var data = '';
		var fstream = Cc['@mozilla.org/network/file-input-stream;1']
			.createInstance(Ci.nsIFileInputStream);
		var cstream = Cc['@mozilla.org/intl/converter-input-stream;1']
			.createInstance(Ci.nsIConverterInputStream);

		try {
			fstream.init(file, -1, 0, 0);
			cstream.init(fstream, 'UTF-8', 0, 0);

			var str = {};
			var read = 0;
			do {
				read = cstream.readString(0xffffffff, str);	// read as much as we can and  put it in str.value
				data += str.value;
			} while (read != 0);
		} catch(err) {
			MOA.log('Error occured when reading addon-notification/rules.json : ' + err);
		} finally {
			if (cstream) {
				try {
					cstream.close();
				} catch (err) {
					MOA.log('Error occured when closing reading addon-notification/rules.json : ' + err);
				}
			}
		}

		return data;
	};

	ns.setStrToProFile = function(file_att, json) {
		if (typeof file_att.shift != 'function' || file_att.length == 0)
			return '';

		var file = Cc['@mozilla.org/file/directory_service;1']
			.getService(Ci.nsIProperties).get('ProfD', Ci.nsIFile);

		// create directory
		var dir_name = file_att.shift();
		while (file_att.length > 0) {
			file.append(dir_name);
			if (!file.exists() || !file.isDirectory()) {
				file.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
			}

			dir_name = file_att.shift();
		}

		// create file
		file.append(dir_name);
		if (!file.exists()) {
			file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0666);
		}

		var foStream = Cc['@mozilla.org/network/file-output-stream;1']
			.createInstance(Ci.nsIFileOutputStream);

		foStream.init(file, 0x02 | 0x08 | 0x20, 0666, 0);

		var converter = Cc['@mozilla.org/intl/converter-output-stream;1']
			.createInstance(Ci.nsIConverterOutputStream);

		try {
			converter.init(foStream, 'UTF-8', 0, 0);
			converter.writeString(json);
		} catch(err) {
			MOA.log('Error occured when writing addon-notification/rules.json : ' + err);
		} finally {
			if (converter) {
				try {
					converter.close();
				} catch (err) {
					MOA.log('Error occured when closing writing addon-notification/rules.json : ' + err);
				}
			}
		}
	};

	ns.getProFilePath = function(filename) {
		return ['addon-notification', filename];
	};

	var __prefs = null;
	ns.getFilePrefs = function() {
		try {
			if (!__prefs) {
				__prefs = JSON.parse(ns.readStrFromProFile(ns.getProFilePath('notifydata.json')));
			}

			return __prefs;
		} catch (err) {
			return {};
		}
	};

	ns.getFilePref = function(key, defValue) {
		var result = this.getFilePrefs()[key];
		return result ? result : defValue;
	};

	ns.clearFilePrefs = function() {
		ns.setStrToProFile(ns.getProFilePath('notifydata.json'), '');
		__prefs = null;
	};

	ns.setFilePref = function(key, value) {
		var p = this.getFilePrefs();
		p[key] = value;
		ns.setStrToProFile(ns.getProFilePath('notifydata.json'), JSON.stringify(p));
	};

	ns.getPrefs = function() {
		return Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefService).getBranch('extensions.addonnotification.');
	};

	ns.httpGet = function(url, onreadystatechange) {
		var xmlHttpRequest = new XMLHttpRequest();
		xmlHttpRequest.open('GET', url, true);
		xmlHttpRequest.send(null);
		xmlHttpRequest.onreadystatechange = function() {
			onreadystatechange(xmlHttpRequest);
			//if (4 == xmlHttpRequest.readyState && 200 == xmlHttpRequest.status) {
			//	onSuccess(xmlHttpRequest);
			//}
		};
	};

	ns.isFirefox4 = function() {
		return typeof Application.getExtensions !== 'undefined';
	};
})();
