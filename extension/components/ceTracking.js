
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const _CID = Components.ID('{C40350A8-F734-4CFF-99D9-95274D408143}');
const _CONTRACTID = "@mozilla.com.cn/tracking;1";
const USAGE_URI = 'http://addons.g-fox.cn/tk.gif';

const ACTIVE_TIME_PREF = "extensions.cpmanager@mozillaonline.com.active_time";
const PK_PREF = "extensions.cpmanager@mozillaonline.com.uuid";
const LOCALE_PREF = "general.useragent.locale";
const CHANNEL_PREF = "app.chinaedition.channel"
const DISTRIBUTION_PREF = "distribution.version"

//Cu.import("resource://gre/modules/Services.jsm");
let Services = {};

XPCOMUtils.defineLazyGetter(Services, "prefs", function () {
  return Cc["@mozilla.org/preferences-service;1"]
           .getService(Ci.nsIPrefService)
           .QueryInterface(Ci.nsIPrefBranch2);
});
XPCOMUtils.defineLazyGetter(Services, "dirsvc", function () {
  return Cc["@mozilla.org/file/directory_service;1"]
           .getService(Ci.nsIDirectoryService)
           .QueryInterface(Ci.nsIProperties);
});
XPCOMUtils.defineLazyServiceGetter(Services, "obs",
                                   "@mozilla.org/observer-service;1",
                                   "nsIObserverService");


//Cu.import("resource://gre/modules/ctypes.jsm");

function LOG(txt){
  var consoleService = Cc["@mozilla.org/consoleservice;1"]
                       .getService(Ci.nsIConsoleService);
                       consoleService.logStringMessage("tracking" + txt);
}

function hasPref(name) {
  try {
  	Services.prefs.getCharPref(name);
    return true;
  } catch (e) {
  	return false;
  }
}

function getPrefStr(name, defValue) {
  try {
  	return Services.prefs.getCharPref(name);
  } catch (e) {
  	return defValue;
  }
}

function setPrefStr(name, value) {
  try {
  	Services.prefs.setCharPref(name, value);
  } catch (e) {
  	Components.utils.reportError(e);
  }
}

const fx21Prefix = "fx21.";
var fx21List = [
    "distribution.about",
    "distribution.id",
    "distribution.version",
    "mozilla.partner.id",
    "app.distributor",
    "app.distributor.channel",
    "app.partner.mozillaonline",
    "app.chinaedition.channel",
];

function backupPref(){
  let backTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  backTimer.initWithCallback({
    notify: function() {
      fx21List.forEach(function(item){
        var newItem = fx21Prefix + item;
        if(hasPref(item)){
          let value = getPrefStr(item,"");
          setPrefStr(newItem,value);
        }
      });
    }
  }, 1000, Ci.nsITimer.TYPE_ONE_SHOT);
}

function generateUUID() {
  return Cc["@mozilla.org/uuid-generator;1"]
          .getService(Ci.nsIUUIDGenerator)
          .generateUUID()
          .number;
}
function isUUID(str){
  return str.length == 38;
}

//user key
function getUK(){
  function getUKFile(){
    let file = null;
    try {
      file = Services.dirsvc.get("DefProfRt",Ci.nsIFile)
      file.append("profiles.log");
    } catch (e) {
      return null;
    }
    return file;
  }
  function readUK(){
    let uuid = "";
    try {
      let file = getUKFile();
      if (!file || !file.exists()) {
        throw "Could not read file ";
      }
      let fstream = Cc["@mozilla.org/network/file-input-stream;1"].
          createInstance(Ci.nsIFileInputStream);
      fstream.init(file, -1, 0, 0);

      let cstream = Cc["@mozilla.org/intl/converter-input-stream;1"].
          createInstance(Ci.nsIConverterInputStream);
      cstream.init(fstream, "UTF-8", 0, 0);
      let str = "";
      let (data = {}) {
        // read the whole file
        while (cstream.readString(-1, data))
          str += data.value;
      }
      cstream.close(); // this also closes fstream
      let obj = JSON.parse(str)
      if(!isUUID(obj.uuid)){
        throw "invalid uuid [" + obj.uuid + "]";
      }
      uuid = obj.uuid;
    }
    catch (e) {
      return "";
    }
    return uuid;
  }
  function writeUK(uuid){
    try{
      let file = getUKFile();
      if (!file) {
        return false;
      }
    let str = JSON.stringify({uuid:uuid});
    let foStream = Cc["@mozilla.org/network/file-output-stream;1"].
        createInstance(Ci.nsIFileOutputStream);
    // flags are write, create, truncate
    foStream.init(file, 0x02 | 0x08 | 0x20, 0666, 0);

    let converter = Cc["@mozilla.org/intl/converter-output-stream;1"].
        createInstance(Ci.nsIConverterOutputStream);
    converter.init(foStream, "UTF-8", 0, 0);
    converter.writeString(str);
    converter.close(); // this also closes foStream
    } catch (e) {
      return false;
    }
    return true;
  }
  var uuid = readUK();
  if(!uuid){
    uuid = generateUUID();
    if(!writeUK(uuid)){
      return "-" + getPK(); //"-" : user key error
    }
  }
  return encodeURIComponent(uuid);
}

//profile key
function getPK(){
  let uuid = "";
  try {
    uuid = Services.prefs.getCharPref(PK_PREF);
    if(!isUUID(uuid)){
      throw "invalid uuid [" + uuid + "]";
    }
  } catch (e) {
    uuid = generateUUID();
  	Services.prefs.setCharPref(PK_PREF,uuid);
  }
	return encodeURIComponent(uuid);
}

////dll key
//function getDK(){
//  function getLib() {
//  	var lib = null;
//  	var uri = Services.io.newURI('resource://tracking-components/cpmanager.dll', null, null);
//  	if (uri instanceof Components.interfaces.nsIFileURL) {
//  		lib = ctypes.open(uri.file.path);
//  	}
//  	return lib;
//  }	var lib = getLib();
//	var ty = ctypes.PointerType(ctypes.int16_t);
//	var getActivationKey = lib.declare("GetActivationKey",
//                      						ctypes.winapi_abi,
//                      						ty);
//	var buffer = getActivationKey();
//	var key = buffer.readString();
//	var freeMemory = lib.declare("FreeMemory",
//                    						ctypes.winapi_abi,
//                    						ctypes.void_t,
//                    						ty);
//	freeMemory(buffer);
//	lib.close();
//	return key;
//}
const ONEDAY = 24*60*60*1000;

var prefileAge = -1;
function getAge() {
  function onSuccess(times) {
    if (times && times.created) {
      var days = (new Date() - times.created) / ONEDAY;
      prefileAge = parseInt(days);
    }
  }
  try{
    Components.utils.import("resource://services-common/utils.js");
    var file = Services.dirsvc.get("ProfD", Ci.nsIFile);
    file.append("times.json")
    CommonUtils.readJSON(file.path).then(onSuccess)
  } catch (e){
  }
};

function getPluginVersion(name) {
  var tags = Cc["@mozilla.org/plugin/host;1"]
             .getService(Ci.nsIPluginHost)
             .getPluginTags({});
  for (var tag of tags) {
    if (tag.name == name) {
      return tag["version"];
    }
  }
  return "";
}

function getActive() {
  try{
    var act = parseInt(Services.prefs.getCharPref(ACTIVE_TIME_PREF));
  } catch(e) {
    var now = (new Date()).getTime();
    Services.prefs.setCharPref(ACTIVE_TIME_PREF,now);//activate,pref no find
    return "&activate=true";
  }
	return "";
}
var activeStr = getActive();

var MOExtensions = "";
function getMOExts() {
  try {
    if (!MOExtensions) {
      var extstr = "";
      try{
        extstr = Services.prefs.getCharPref("extensions.enabledItems");
      } catch(e) {}
      try{
        extstr = Services.prefs.getCharPref("extensions.enabledAddons");
      } catch (e){}
      var extensions = extstr.split(",");
      extensions = extensions.map(function(ext) ext.replace('%40', '@'));

      var bootstrapped = {};
      try{
        var bsstr = Services.prefs.getCharPref("extensions.bootstrappedAddons");
        bootstrapped = JSON.parse(bsstr);
      } catch(e) {
        bootstrapped = {};
      }
      for (var id in bootstrapped) {
        extensions.push(id);
      }
      MOExtensions = extensions.filter(function(ext) /(@mozillaonline\.com|@mozilla\.com\.cn|muter@yxl\.name|personas@christopher\.beard)/.test(ext));
      MOExtensions = MOExtensions.map(function(ext) ext.substring(0, ext.indexOf("@")));
      MOExtensions = MOExtensions.join(",");
    }
    return MOExtensions ? "&moexts=" + MOExtensions : "";
  } catch(e) {
    return "";
  }
}

function getADUData(){

  let channelidstr = "?channelid=";
  if(hasPref(CHANNEL_PREF)){
    let channelid = getPrefStr(CHANNEL_PREF,"www.firefox.com.cn");
    channelidstr += channelid;
  } else {
    let channelid = getPrefStr(fx21Prefix + CHANNEL_PREF,"www.mozilla.com.cn");
    channelidstr += channelid;
    channelidstr += "&noid=true";
  }

  let pk = getPK();
  let uk = getUK();
  let ver = getPrefStr("extensions.lastAppVersion","");
  let cev = getPrefStr(DISTRIBUTION_PREF,"");
	return channelidstr
    // + cpmanager_paramFUOD(fuodPref)
       + "&fxversion=" + ver                       //cpmanager_paramCEVersion
       + "&ceversion=" + cev                       //cpmanager_paramCEVersion
       + "&ver=1_0&pk=" + pk + "&uk=" + uk         //cpmanager_paramActCode()
    // + cpmanager_paramSyncStatus()
    // + cpmanager_paramCEHome()
    // + cpmanager_paramPrevSessionLen()
       + activeStr                                 //cpmanager_paramActive()
       + "&locale=" + getPrefStr(LOCALE_PREF, "")  //cpmanager_paramLocale()
       + getMOExts()    //cpmanager_paramMOExts()
       + "&age=" + prefileAge
       + "&flash=" + getPluginVersion("Shockwave Flash")  //get flash version
}

function httpGet (url) {
    let xmlHttpRequest = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
    xmlHttpRequest.QueryInterface(Ci.nsIJSXMLHttpRequest);
    xmlHttpRequest.open('GET', url, true);
    xmlHttpRequest.send(null);
    xmlHttpRequest.onreadystatechange = function() {
    };
};
const RETRY_DELAY = 20*1000;
let ADU_Task = [
  {
    task: "5s",
    delay: 5*1000,
    url: 'http://adu.g-fox.cn/adu.gif',
  },
  {
    task: "5m",
    delay: 5*60*1000,
    url: 'http://adu.g-fox.cn/adu-1.gif',
  },
];
let ADUIndex = 0;
let ADUTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);

function sendADU(index){
  if(index >= ADU_Task.length){
    return;
  }
  _ADU(ADU_Task[index].delay);
}

function _ADU(delay){
  ADUTimer.initWithCallback({
    notify: function() {
      let str =  ADU_Task[ADUIndex].url + getADUData() + '&now=' + (new Date()).getTime();
      let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
                  .createInstance(Ci.nsIXMLHttpRequest);
      xhr.QueryInterface(Ci.nsIJSXMLHttpRequest);
      xhr.open('GET', str, true);
      xhr.addEventListener("error", function(event) { _ADU(RETRY_DELAY);}, false);
      xhr.addEventListener("load", function(event) { sendADU(++ADUIndex);}, false);
      xhr.send(null);
    }
  }, delay, Ci.nsITimer.TYPE_ONE_SHOT);
}

let trackingFactoryClass = function() {
  this.wrappedJSObject = this;
}

trackingFactoryClass.prototype = {
  classDescription: "Tracking for Imporve Firefox",
  contractID: _CONTRACTID,
  classID: _CID,
  _xpcom_categories: [{ category: "profile-after-change" }],
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  //tracking key:count
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

  sendUsageData : function(){
    let str = '';
    data = this.data
    for(let i in data){
      str += '&' + i + '=' + data[i];
    }
    if(str == ''){
      return;
    }
    let tracking_random = Math.random();
    str =  USAGE_URI + '?when=quit?r='+tracking_random + str;
    httpGet(str);
  },

  observe: function (aSubject, aTopic, aData) {
    switch (aTopic) {
      case "profile-after-change":
        getAge();
        Services.obs.addObserver(this, "quit-application", true);
        Services.obs.addObserver(this, "final-ui-startup", true);
        let tracking_random = Math.random();
        let str = USAGE_URI + '?when=run';
        httpGet(str);
        break;

      case "final-ui-startup":
        backupPref();
        sendADU(0);
        break;
      case "quit-application":
        this.sendUsageData();
        break;
    };
  },

}

if (XPCOMUtils.generateNSGetFactory) {
  const NSGetFactory = XPCOMUtils.generateNSGetFactory([trackingFactoryClass]);
} else {
  const NSGetModule = function (aCompMgr, aFileSpec) {
    return XPCOMUtils.generateModule([trackingFactoryClass]);
  }
}
