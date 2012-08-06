var {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const _CID = Components.ID('{C40350A8-F734-4CFF-99D9-95274D408143}');
const _CONTRACTID = "@mozilla.com.cn/tracking;1";
const _URI = 'http://addons.g-fox.cn/tk.gif';

Cu.import("resource://gre/modules/Services.jsm");


["LOG", "WARN", "ERROR"].forEach(function(aName) {
  this.__defineGetter__(aName, function() {
    Cu.import("resource://gre/modules/AddonLogging.jsm");

    LogManager.getLogger("tracking", this);
    return this[aName];
  });
}, this);

function httpGet (url) {
    var xmlHttpRequest = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
    xmlHttpRequest.QueryInterface(Ci.nsIJSXMLHttpRequest);
    xmlHttpRequest.open('GET', url, true);
    xmlHttpRequest.send(null);
    xmlHttpRequest.onreadystatechange = function() {
    };
};

var trackingFactoryClass = function() {
  this.wrappedJSObject = this;
}

trackingFactoryClass.prototype = {
  classID: _CID,
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  //tracking数据 key:count
  data : {},

  trackPrefs : function(key,value){
    this.data[key] = value;
  },
  
  track : function(key){
    if(typeof this.data[key] == 'number'){
      this.data[key] ++;
    }else{
      this.data[key] = 1;
    }
  },

  send : function(){
    var str = '';
    data = this.data
    for(var i in data){
      str += '&' + i + '=' + data[i];
    }
    if(str == ''){
      return;
    }
    var tracking_random = Math.random();
    str =  _URI + '?when=quit-application?r='+tracking_random + str;
    httpGet(str);
  },

  observe: function (aSubject, aTopic, aData) {
    switch (aTopic) {
      case "profile-after-change":
        Services.obs.addObserver(this, "quit-application", true);
        var tracking_random = Math.random();
        var str = _URI + '?when=profile-after-change';
        httpGet(str);

        break;
      case "quit-application":
        this.send();
        break;
    };
  }
}

var NSGetFactory = XPCOMUtils.generateNSGetFactory([trackingFactoryClass]);
