
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const _CID = Components.ID('{8B3F1179-2566-F287-1DF1-99E1FB4627BE}');
const _CONTRACTID = "@mozilla.com.cn/repare/reg;1";



function LOG(txt){
  var consoleService = Cc["@mozilla.org/consoleservice;1"]
                       .getService(Ci.nsIConsoleService);    
                       consoleService.logStringMessage("repareReg" + txt);
}
function repare(){
  ["SOFTWARE\\Classes\\http\\shell\\",
   "SOFTWARE\\Classes\\https\\shell\\"].forEach(function(key){
    var value = "open";
    try {
      let wrk = Cc["@mozilla.org/windows-registry-key;1"]
                .createInstance(Ci.nsIWindowsRegKey);
      wrk.open(wrk.ROOT_KEY_CURRENT_USER,key,
               wrk.ACCESS_READ);
      value = wrk.readStringValue("");
      wrk.close();
    } catch(e) {
    }
    if(value == "open")
      return;
    try {
      let wrk = Cc["@mozilla.org/windows-registry-key;1"]
                .createInstance(Ci.nsIWindowsRegKey);
      wrk.open(wrk.ROOT_KEY_CURRENT_USER,key,
               wrk.ACCESS_WRITE);
      wrk.writeStringValue("","open");
      wrk.close();
    } catch(e) {
    }
    
  })
}

let repareFactoryClass = function() {
  this.wrappedJSObject = this;
}

repareFactoryClass.prototype = {
  classDescription: "Repare Reg for Firefox",
  contractID: _CONTRACTID,
  classID: _CID,
  _xpcom_categories: [{ category: "profile-after-change" }],
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),
  observe: function (aSubject, aTopic, aData) {
    switch (aTopic) {
      case "profile-after-change":
        repare();
        break;

    };
  },

}

if (XPCOMUtils.generateNSGetFactory) {
  const NSGetFactory = XPCOMUtils.generateNSGetFactory([repareFactoryClass]);
} else {
  const NSGetModule = function (aCompMgr, aFileSpec) {
    return XPCOMUtils.generateModule([repareFactoryClass]);
  }
}
