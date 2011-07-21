const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');

function log(aMessage) {
	dump('Notifier: ' + aMessage + '\n');
}

function NotifierModule() {
	this.wrappedJSObject = this;
	this.observers = [];
}

NotifierModule.prototype = {
	classDescription: 'Notifier http observer.',
	contractID: '@mozilla.org/notifier-http-observer;1',
	classID: Components.ID('{7cd7ccb6-bd40-4978-9c59-bbce9230cb6d}'),

	_xpcom_categories: [{ category: "profile-after-change", service: true }],

	// implements nsISupports
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference, Ci.nsIObserverService]),

	// implements nsIObserverService
	addObserver: function(observer, topic, weak) {
		if (topic != 'notifier-http-event')
			throw Cr.NS_ERROR_INVALID_ARG;

		this.observers.push(observer);
	},

	removeObserver: function(observer, topic) {
		if (topic != 'notifier-http-event')
			throw Cr.NS_ERROR_INVALID_ARG;

		for (var i = 0; i < this.observers.length; i++) {
			if (this.observers[i] == observer) {
				this.observers.splice(i, 1);
				return;
			}
		}
	},

	notifyObservers: function(subject, topic, data) {
		for (var i = 0; i < this.observers.length; i++) {
			this.observers[i].observe(subject, topic, data)	;
		}
	},

	enumerateObservers: function(topic) {
		return null;
	},

	// implements nsIObserve
	observe: function(subject, topic, data) {
		try {
			switch (topic) {
				case 'app-startup':
					this.onAppStartup();
					break;
				case 'http-on-modify-request':
				case 'http-on-examine-response':
				case 'http-on-examine-cached-response':
					this.notifyObservers(subject, topic, data);
					break;
			}
		} catch (err) {
			log(err);
		}
	},

	onAppStartup: function() {
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.addObserver(this, 'http-on-modify-request', false);
		observerService.addObserver(this, 'http-on-examine-response', false);
		observerService.addObserver(this, 'http-on-examine-cached-response', false);
		log('Notifier module is starting up!');
	}
};
/*
function NSGetModule(mgr, spec) {
	return XPCOMUtils.generateModule([NotifierModule]);
} */

// Definition for Firefox4
if (XPCOMUtils.generateNSGetFactory) {
	const NSGetFactory = XPCOMUtils.generateNSGetFactory([NotifierModule]);
} else {
	const NSGetModule = function (aCompMgr, aFileSpec) {
		return XPCOMUtils.generateModule([NotifierModule]);
	}
}
