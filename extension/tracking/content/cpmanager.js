(function() {
  var tmp = {};
  Components.utils.import("resource://cmtracking/cpmanager_mod.js", tmp);
  Components.utils.import("resource://gre/modules/XPCOMUtils.jsm", tmp);
  if(!isFirefoxLowerThan4()){
    Components.utils.import("resource://gre/modules/Services.jsm", tmp);
    Components.utils.import("resource://gre/modules/ctypes.jsm", tmp);
  } else {
    tmp.Services = {};

    XPCOMUtils.defineLazyGetter(tmp.Services, "prefs", function () {
      return Cc["@mozilla.org/preferences-service;1"]
               .getService(Ci.nsIPrefService)
               .QueryInterface(Ci.nsIPrefBranch2);
    });
    XPCOMUtils.defineLazyGetter(tmp.Services, "dirsvc", function () {
      return Cc["@mozilla.org/file/directory_service;1"]
               .getService(Ci.nsIDirectoryService)
               .QueryInterface(Ci.nsIProperties);
    });
    XPCOMUtils.defineLazyServiceGetter(tmp.Services, "obs",
                                       "@mozilla.org/observer-service;1",
                                       "nsIObserverService");

    XPCOMUtils.defineLazyGetter(tmp.Services, "dirsvc", function () {
      return Cc["@mozilla.org/file/directory_service;1"]
               .getService(Ci.nsIDirectoryService)
               .QueryInterface(Ci.nsIProperties);
    });
  }
  var {cp_mod, cpmanager_FileUtil, cpmanager_LOG, Services, ctypes} = tmp;


  var PK_PREF = "extensions.cpmanager@mozillaonline.com.uuid";
  var CPMANAGER_ADDON_LIST_NEW_URL = "http://www.g-fox.cn/live.gif";
  var CPMANAGER_ADDON_LIST_NEW_URL_FIRSTTIME = "http://www.g-fox.cn/activate.gif";
  var CPMANAGER_ADDON_LIST_NEW_URL_ONLINE = "http://www.g-fox.cn/online.gif";
  var CPMANAGER_ADDON_LIST_NEW_URL_ONLINE2 = "http://www.g-fox.cn/online15.gif";
  var cpmanager_xmlHttp = null;
  var cpmanager_init_delay = 5000;
  var cpmanager_online_delay = 5*60*1000;
  var cpmanager_online_delay2 = 15*60*1000;
  var cpmanager_relive_delay = 24*60*60*1000;
  //var cpmanager_partner_activate_interval = 7*24*60*60*1000
  var cpmanager_partner_activate_interval = 0;

  //Application.extensions is nolonger available in Firefox 4, so it must be rewrited.

   function cpmanager_setPrefValue(prefName, value){
    try {
      var prefs = Application.prefs;
      var name = "extensions.cpmanager@mozillaonline.com." + prefName;
      return prefs.setValue(name, value);
    } catch(e) {
      Components.utils.reportError(e);
    }
  }
   function cpmanager_getPrefValue(prefName, defValue) {
    try {
      var prefs = Application.prefs;
      var name = "extensions.cpmanager@mozillaonline.com." + prefName;
      return prefs.getValue(name, defValue);
    } catch (e) {
      Components.utils.reportError(e);
    }
  }

  /*
    return whether this is the first update of the day as a param.
  */
  function cpmanager_paramFUOD(prefName){
    try {
//    var partnerID = prefs.getCharPref("mozilla.partner.id");
      var lastdate = cpmanager_getPrefValue(prefName,"");
//    this.cpmanager_LOG(prefName + " = " + initialized);
      var date = new Date();
      var strDate = "" + date.getYear() + "/" + date.getMonth() + "/" + date.getDate();
      if (lastdate != strDate) {
        cpmanager_setPrefValue(prefName, strDate);
        //first update of the day
        return "&fuod=true";
      }
      return "";
    } catch (e) {
      Components.utils.reportError(e);
      return "";
    }
  }

  function cpmanager_paramCEVersion(){
    var str = "";
    try {
      str += "&fxversion=" + Application.prefs.getValue("extensions.lastAppVersion","");
      str += "&ceversion=" + Application.prefs.getValue("distribution.version","");
    } catch (e) {
      Components.utils.reportError(e);
    }
    return str;
  }

  //dll key
  function getDK(){
    function getLib() {
      var lib = null;
      var uri = Services.io.newURI('resource://tracking-components/cpmanager.dll', null, null);
      if (uri instanceof Components.interfaces.nsIFileURL) {
        lib = ctypes.open(uri.file.path);
      }
      return lib;
    }
    try{
      var lib = getLib();
      var ty = ctypes.PointerType(ctypes.int16_t);
      var getActivationKey = lib.declare("GetActivationKey",
                                      ctypes.winapi_abi,
                                      ty);
      var buffer = getActivationKey();
      var key = buffer.readString();
      var freeMemory = lib.declare("FreeMemory",
                                    ctypes.winapi_abi,
                                    ctypes.void_t,
                                    ty);
      freeMemory(buffer);
      lib.close();
      return key;
    } catch(e){
      return "-" + getPK();
    }
  }

  function generateUUID() {
    return Cc["@mozilla.org/uuid-generator;1"]
            .getService(Ci.nsIUUIDGenerator)
            .generateUUID().number;
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
        return '-' + getPK(); //"-" : user key error
      }
    }
    return encodeURIComponent(uuid);
  }

  //profile key
  function getPK(){
    let uuid = "";
    try {
      uuid = Application.prefs.getValue(PK_PREF,"");
      if(!isUUID(uuid)){
        throw "invalid uuid [" + uuid + "]";
      }
    } catch (e) {
      uuid = generateUUID();
    	Application.prefs.setValue(PK_PREF,uuid);
    }
  	return encodeURIComponent(uuid);
  }

  function cpmanager_paramActCode() {
    var str = "";
    try {
      str += "&ver=4&actcode4=" + getPK();
      str += "&uk=" + getUK();
      if (navigator.platform.indexOf("Win") == -1) {
        return str;
      } else {
        return str + "&dk=" + getDK();
      }
    } catch (e) {
      Components.utils.reportError(e);
      return str;
    }
  }

  function cpmanager_paramSyncStatus() {
    try {
      if (!Weave) {
        Cu.import('resource://services-sync/main.js');
      }
      var status = Weave.Status.checkSetup();
      switch (status) {
        case Weave.CLIENT_NOT_CONFIGURED:
          return "&syncst=cnf";
        case Weave.STATUS_OK:
          return "&syncst=ok";
        case Weave.LOGIN_FAILED:
          return "&syncst=elf";
        default:
          return "&syncst=" + status;
      }
    } catch (e) {
        cpmanager_LOG(e);
      return "";
      }
  }

  function cpmanager_paramCEHome() {
    var homePrefBranch = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefService).getBranch('browser.startup.');
    var homePref = homePrefBranch.getComplexValue("homepage", Ci.nsIPrefLocalizedString).data;
    var usingCEHome = [/^about:cehome$/, /^http:\/\/[a-z]+\.firefoxchina\.cn/, /^http:\/\/[iz]\.g-fox\.cn/].some(function(regex) {
      return regex.test(homePref);
    });
    return "&cehome=" + usingCEHome;
  }

  function cpmanager_paramPrevSessionLen() {
    return "&prevsessionlen=" + cpmanager_getPrefValue('prevsessionlen', 0);
  }

  function cpmanager_paramActive() {
    if (((new Date()).getTime() - parseInt(cpmanager_getPrefValue("init_time",0))) / 86400000 >= 15) {
      return "&days=15";
    } else {
      return "";
    }
  }

  function cpmanager_paramLocale() {
      return "&locale=" + Application.prefs.getValue("general.useragent.locale", "");
  }

  var MOExtensions = "";
  function cpmanager_paramMOExts() {
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

  function cpmanager_recordSessionLen() {
    cp_mod.winCount -= 1;
    if (!cp_mod.winCount) {
      cpmanager_setPrefValue('prevsessionlen', (Date.now() - cp_mod.startTime) / (60 * 1000));
    }
  }

  //get the new list from internet
  function cpmanager_init(){
    cpmanager_LOG("cpmanager: cpmanager inited");
      try {
        var prefName = "initialized";
      var initialized = cpmanager_getPrefValue(prefName,false);

      if (!cpmanager_getPrefValue("uuid", "")) {
        cpmanager_setPrefValue("uuid", generateUUID());
      }

        if (!initialized) {
        //first time
        cp_mod.firstTime = true;
          cpmanager_setPrefValue(prefName, true);
        cpmanager_LOG ("cpmanager: First Run ");

        //add for partner activate
        var initTime = (new Date()).getTime().toString();
        cpmanager_setPrefValue("init_time",initTime);
        cpmanager_startUpdate(CPMANAGER_ADDON_LIST_NEW_URL_FIRSTTIME, 'update_date');
        } else {
        cpmanager_startUpdate(CPMANAGER_ADDON_LIST_NEW_URL, 'update_date');
      }
      } catch (e) {
        Components.utils.reportError(e);
      }
  }

  function cpmanager_online(){
    cpmanager_LOG("cpmanager: cpmanager online");
      try {
        cpmanager_startUpdate(CPMANAGER_ADDON_LIST_NEW_URL_ONLINE, 'online_date');
      } catch (e) {
        Components.utils.reportError(e);
      }
  }

  function cpmanager_online2(){
    cpmanager_LOG("cpmanager: cpmanager online2");
      try {
        cpmanager_startUpdate(CPMANAGER_ADDON_LIST_NEW_URL_ONLINE2, 'online_date2');
      } catch (e) {
        Components.utils.reportError(e);
      }
  }

  //get AddonListNew and start the installation check.
  function cpmanager_startUpdate(updateUrl, fuodPref){
    function hasPref(key) {
      return Application.prefs.has(key);
    }

    function getPrefStr(key, defValue) {
      return Application.prefs.getValue(key, defValue);
    }

    let fx21Prefix = "fx21.";
    let CHANNEL_PREF = "app.chinaedition.channel";
    let channelidstr = "?channelid=";
    if(hasPref(CHANNEL_PREF)){
      let channelid = getPrefStr(CHANNEL_PREF,"www.firefox.com.cn");
      channelidstr += channelid;
    } else {
      let channelid = getPrefStr(fx21Prefix + CHANNEL_PREF,"www.mozilla.com.cn");
      channelidstr += channelid;
      channelidstr += "&noid=true";
    }
    updateUrl += channelidstr
               + cpmanager_paramFUOD(fuodPref)
               + cpmanager_paramCEVersion()
               + cpmanager_paramActCode()
//             + cpmanager_paramSyncStatus()
//             + cpmanager_paramCEHome()
               + cpmanager_paramPrevSessionLen()
//               + cpmanager_paramActive()
               + cpmanager_paramLocale()
               + cpmanager_paramMOExts()
               ;
    cpmanager_LOG("cpmanager: start getting new Addon List at :" + updateUrl);
    try {
      if (window.XMLHttpRequest && cpmanager_xmlHttp == null) {
        cpmanager_xmlHttp = new XMLHttpRequest();
      }

      if (cpmanager_xmlHttp != null){
        cpmanager_xmlHttp.open("GET", updateUrl, true);
        cpmanager_xmlHttp.send(null);
      }
    } catch (e){
      Components.utils.reportError(e);
    }
  }

  function cpmanager_updateHandler(addonID){
    var em = Components.classes["@mozilla.org/extensions/manager;1"].getService(Components.interfaces.nsIExtensionManager);
    em.addDownloads([em.getItemForID(addonID)],1,null);
  }

  //Application.events.addListener("load",listener);
  function cpmanager_loadEventHandler(event){
    cp_mod.startTime = cp_mod.startTime || Date.now();
    cp_mod.winCount += 1;
    window.addEventListener('unload', cpmanager_recordSessionLen, false);
    if (cp_mod.touched) return;
    cp_mod.touched = true;
    window.setTimeout(cpmanager_init,cpmanager_init_delay);
    window.setTimeout(cpmanager_online,cpmanager_online_delay);
    window.setTimeout(cpmanager_online2,cpmanager_online_delay2);
    //switch to nsITimer, notice that, in order to use nsITimer, you have to know what is GCed when the window is closed.
    cp_mod.timer = Components.classes["@mozilla.org/timer;1"]
         .createInstance(Components.interfaces.nsITimer);
    cp_mod.event = {
          wm: Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator),
          notify: function(timer) {
            var win = this.wm.getMostRecentWindow("navigator:browser");
            if (win && win.MOA && win.MOA.CPManager) {
            //  win.cpmanager_LOG("lalalalala");
              win.setTimeout(win.MOA.CPManager.cpmanager_init(), win.MOA.CPManager.cpmanager_init_delay);
              win.setTimeout(win.MOA.CPManager.cpmanager_online(), win.MOA.CPManager.cpmanager_online_delay);
              win.setTimeout(win.MOA.CPManager.cpmanager_online2(), win.MOA.CPManager.cpmanager_online_delay2);
            }
        } };

    cp_mod.timer.initWithCallback(cp_mod.event,cpmanager_relive_delay, Components.interfaces.nsITimer.TYPE_REPEATING_PRECISE);
  //  window.setTimeout(cpmanager_loadEventHandler,cpmanager_relive_delay);
  }

  function isFirefoxLowerThan4() {
    return typeof Application.getExtensions == "undefined";
  }

  function log(msg) {
    // Components.utils.reportError(msg);
  }

  function setXpinstallWhitelist() {
    if (isFirefoxLowerThan4()) {
      log("It is lower than 4.");
      return;
    }

    // Since ff4, xpinstall.whitelist.add does not work anymore.
    // To make sure that all the ff4 user work again, import all the whitelist here.
    Components.utils["import"]("resource://gre/modules/Services.jsm");
    if (!Services.prefs.getBoolPref("extensions.cpmanager@mozillaonline.com.xpinstall.importlist", false)) {
      return;
    }
    Services.prefs.setBoolPref("extensions.cpmanager@mozillaonline.com.xpinstall.importlist", false);

    Components.utils["import"]("resource://gre/modules/NetUtil.jsm");

    var domains = Services.prefs.getCharPref("extensions.cpmanager@mozillaonline.com.xpinstall.whitelist.add", "").split(",");
    domains.forEach(function(domain) {
      try {
        if (!domain.trim())
          return;

        var uri = NetUtil.newURI("http://" + domain);
        if (Services.perms.UNKNOWN_ACTION == Services.perms.testExactPermission(uri, "install")) {
          Services.perms.add(uri, "install", Services.perms.ALLOW_ACTION);
        }
      } catch (e) {
        log(e);
      }
    });
  }

  window.addEventListener("load", function() {
    cpmanager_loadEventHandler();
    setXpinstallWhitelist();
  }, false);

  var ns = MOA.ns('CPManager');
  ns.cpmanager_init = cpmanager_init;
  ns.cpmanager_online = cpmanager_online;
  ns.cpmanager_online2 = cpmanager_online2;
  ns.cpmanager_init_delay = cpmanager_init_delay;
  ns.cpmanager_online_delay = cpmanager_online_delay;
  ns.cpmanager_online_delay2 = cpmanager_online_delay2;
})();
