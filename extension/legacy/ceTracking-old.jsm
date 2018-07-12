this.EXPORTED_SYMBOLS = ["ceTrackingOld"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.importGlobalProperties(["XMLHttpRequest"]);

const _CID = Components.ID("{6E12E09F-1942-46F0-8D85-9C6B1D0E6448}");
const _CONTRACTID = "@mozilla.com.cn/tracking-old;1";

const ACTIVE_TIME_PREF = "extensions.cpmanager@mozillaonline.com.active_time";
const PK_PREF = "extensions.cpmanager@mozillaonline.com.uuid";
const CHANNEL_PREF = "app.chinaedition.channel"
const DISTRIBUTION_PREF = "distribution.version"

Cu.import("resource://gre/modules/Services.jsm");

function getPrefStr(name, defValue) {
  try {
    return Services.prefs.getCharPref(name);
  } catch (e) {
    return defValue;
  }
}

function generateUUID() {
  return Cc["@mozilla.org/uuid-generator;1"]
          .getService(Ci.nsIUUIDGenerator)
          .generateUUID()
          .number;
}
function isUUID(str) {
  return str.length == 38;
}

// user key
function getUK() {
  function getUKFile() {
    let file = null;
    try {
      file = Services.dirsvc.get("DefProfRt", Ci.nsIFile)
      file.append("profiles.log");
    } catch (e) {
      return null;
    }
    return file;
  }
  function readUK() {
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
      let str = "", data = {};
      // read the whole file
      while (cstream.readString(-1, data)) {
        str += data.value;
      }
      cstream.close(); // this also closes fstream
      let obj = JSON.parse(str)
      if (!isUUID(obj.uuid)) {
        throw "invalid uuid [" + obj.uuid + "]";
      }
      uuid = obj.uuid;
    } catch (e) {
      return "";
    }
    return uuid;
  }
  function writeUK(uuid) {
    try {
      let file = getUKFile();
      if (!file) {
        return false;
      }
    let str = JSON.stringify({uuid});
    let foStream = Cc["@mozilla.org/network/file-output-stream;1"].
        createInstance(Ci.nsIFileOutputStream);
    // flags are write, create, truncate
    foStream.init(file, 0x02 | 0x08 | 0x20, 0o666, 0);

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
  if (!uuid) {
    uuid = generateUUID();
    if (!writeUK(uuid)) {
      return "-" + getPK(); // "-" : user key error
    }
  }
  return encodeURIComponent(uuid);
}

// profile key
function getPK() {
  let uuid = "";
  try {
    uuid = Services.prefs.getCharPref(PK_PREF);
    if (!isUUID(uuid)) {
      throw "invalid uuid [" + uuid + "]";
    }
  } catch (e) {
    uuid = generateUUID();
    Services.prefs.setCharPref(PK_PREF, uuid);
  }
  return encodeURIComponent(uuid);
}

function cpmanager_paramCEHome() {
  var usingCEHome = "badpref";
  try {
    var homePref = Services.prefs.getComplexValue("browser.startup.homepage", Ci.nsIPrefLocalizedString).data;
    usingCEHome = [/^about:cehome$/, /^https?:\/\/[a-z]+\.firefoxchina\.cn/, /^http:\/\/[iz]\.g-fox\.cn/].some(function(regex) {
      return homePref.split("|").some(function(home) {
        return regex.test(home);
      });
    }).toString();
  } catch (e) {}
  return "&cehome=" + usingCEHome;
}

const ONEDAY = 24 * 60 * 60 * 1000;

function getLocale() {
  try {
    return Services.locale.getAppLocaleAsLangTag();
  } catch (ex) {
    return "";
  }
}

var profileAge = -1;
function getAge() {
  function onSuccess(times) {
    if (times && times.created) {
      var days = (new Date() - times.created) / ONEDAY;
      profileAge = parseInt(days);
    }
  }
  try {
    Components.utils.import("resource://services-common/utils.js");
    var file = Services.dirsvc.get("ProfD", Ci.nsIFile);
    file.append("times.json");
    CommonUtils.readJSON(file.path).then(onSuccess);
  } catch (e) {
  }
}

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

function isDefaultBrowser(aForAllTypes) {
  try {
    return Cc["@mozilla.org/browser/shell-service;1"]
             .getService(Components.interfaces.nsIShellService)
             .isDefaultBrowser(false, aForAllTypes);
  } catch (e) {
    return null;
  }
}

function getActive() {
  try {
    parseInt(Services.prefs.getCharPref(ACTIVE_TIME_PREF));
  } catch (e) {
    var now = (new Date()).getTime();
    Services.prefs.setCharPref(ACTIVE_TIME_PREF, now);// activate,pref no find
    return "&activate=true";
  }
  return "";
}
var activeStr = getActive();

function getADUData() {
  let channelidstr = "?channelid=";
  let channelid = getPrefStr(CHANNEL_PREF, "www.firefox.com.cn");
  channelidstr += channelid;

  let pk = getPK();
  let uk = getUK();
  let ver = getPrefStr("extensions.lastAppVersion", "");
  let cev = getPrefStr(DISTRIBUTION_PREF, "");
  return channelidstr
       + "&fxversion=" + ver
       + "&ceversion=" + cev
       + "&ver=2_2&pk=" + pk + "&uk=" + uk
       + cpmanager_paramCEHome()
       + activeStr
       + "&locale=" + getLocale()
       + "&age=" + profileAge
       + "&default=" + isDefaultBrowser(true)
       + "&defaultHttp=" + isDefaultBrowser(false)
       + "&flash=" + getPluginVersion("Shockwave Flash")
}

const RETRY_DELAY = 20 * 1000;
const ADU_Task = [
  {
    task: "5s",
    delay: 5 * 1000,
    url: "http://adu.g-fox.cn/adu.gif",
  }
];
var ADUIndex = 0;
const ADUTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);

function sendADU(index) {
  if (index >= ADU_Task.length) {
    return;
  }
  _ADU(ADU_Task[index].delay);
}

function _ADU(delay) {
  ADUTimer.initWithCallback({
    notify() {
      let str =  ADU_Task[ADUIndex].url + getADUData() + "&now=" + (new Date()).getTime();
      let xhr = new XMLHttpRequest();
      xhr.open("GET", str, true);
      xhr.addEventListener("error", function(event) { _ADU(RETRY_DELAY); });
      xhr.addEventListener("load", function(event) { sendADU(++ADUIndex); });
      xhr.send(null);
    }
  }, delay, Ci.nsITimer.TYPE_ONE_SHOT);
}

function ceTrackingOld() {
  this.wrappedJSObject = this;
}

ceTrackingOld.prototype = {
  classDescription: "Tracking for Imporve Firefox",
  contractID: _CONTRACTID,
  classID: _CID,
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "final-ui-startup":
        sendADU(0);
        break;
    }
  },

  init() {
    getAge();
    Services.obs.addObserver(this, "final-ui-startup", true);
  },

  uninit() {
    Services.obs.removeObserver(this, "final-ui-startup");
  }
}
