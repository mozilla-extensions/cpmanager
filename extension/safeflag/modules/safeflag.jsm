var EXPORTED_SYMBOLS = ['safeflag'];

var _listManager = Components.classes["@mozilla.org/url-classifier/listmanager;1"].getService(Components.interfaces.nsIUrlListManager);
var safeflag = {
	lookup: function(url, callback) {
    	_listManager.safeLookup(url, function(tableName) {
			if (typeof callback == 'function') {
				callback({
					isMalware: tableName == 'goog-malware-shavar' || tableName == 'googpub-malware-shavar',
					isPhishing: tableName == 'goog-phish-shavar' || tableName == 'googpub-phish-shavar'
				});
			}
		});
	}
};
