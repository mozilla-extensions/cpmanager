Components.utils.import("resource://cpmanager/cpmanager_mod.js");

var CPMANAGER_ADDON_LIST_NEW_URL = "http://www.g-fox.cn/live.php";
var CPMANAGER_ADDON_LIST_NEW_URL_FIRSTTIME = "http://www.g-fox.cn/activate.php";
var cpmanager_xmlHttp = null;
var cpmanager_init_delay_initial = 5000;
var cpmanager_init_delay = 15*60*1000;
var cpmanager_relive_delay = 24*60*60*1000;
//var cpmanager_partner_activate_interval = 7*24*60*60*1000
var cpmanager_partner_activate_interval = 0;

function cpmanager_setPrefValue(name,value){
	try {
		var prefs = Application.extensions.get("cpmanager@mozillaonline.com").prefs;
		prefs.setValue(name,value);
	} catch (e){
		Components.utils.reportError(e);
	}
}

function cpmanager_getPrefValue(name,def_val){
	try {
		cpmanager_LOG("cpmanager: cpmanager_getPrefValue");
		var prefs = Application.extensions.get("cpmanager@mozillaonline.com").prefs;
		cpmanager_LOG("cpmanager: cpmanager_getPrefValue: " + prefs);
		return prefs.getValue(name,def_val);
	} catch (e) {
  		Components.utils.reportError(e);
  	}
}

/*
	return whether this is the first update of the day as a param.
*/
function cpmanager_paramFUOD(){
  	try {
		var prefName = "update_date";
//		var partnerID = prefs.getCharPref("mozilla.partner.id");
		var lastdate = cpmanager_getPrefValue(prefName,"");
//			this.cpmanager_LOG(prefName + " = " + initialized);
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

/*
	check partner Activate
*/
function cpmanager_paramPartnerActivate(){
  	try {
		cpmanager_LOG("param partner");
//no this param for non-windows machine
		if (navigator.appVersion.indexOf("Win") == -1) {
			return "";
		}
		var cpmanager_partner_activate_count = cpmanager_getPrefValue("partner_activate_count",999);
		if (cpmanager_partner_activate_count == 999) return "";
		var partnerActivateState = cpmanager_getPrefValue("partner_activate_state","A");
		//the condition cpmanager_getPrefValue("init_count",0) > cpmanager_partner_activate_count     is not >= is becasue the init_count is increased at the startup, so 2 means this is the second time, not the 3rd.
		if (partnerActivateState == "A" && cpmanager_getPrefValue("init_count",0) > cpmanager_partner_activate_count){
			cpmanager_setPrefValue("partner_activate_state","B");
			var uidGenerator = Components.classes["@mozillaonline.com/uidgenerator;1"].createInstance();
			uidGenerator = uidGenerator.QueryInterface(Components.interfaces.IUidGenerator);
			var path = uidGenerator.getCommonAppdataFolder();
			var file = Components.classes["@mozilla.org/file/local;1"]
						   .createInstance(Components.interfaces.nsILocalFile);
			file.initWithPath(path);
			file.append("Mozilla Firefox");
// this file exist so that the activate wont run twice for two users
			if( !file.exists() || !file.isDirectory() ) {   // if it doesn't exist, create
				file.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0777);
			}
			file.append("partnerActivated.txt");
			if (!file.exists()){
				file.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0666);
				//cpmanager_partnerActivate();
				return "&partnerActivate=true";
			}
			return "&partnerActivate=NotFirstTime";
		}
		return "";
  	} catch (e) {
  		Components.utils.reportError(e);
		return "";
  	}
}

function cpmanager_paramCEVersion(){
  	try {
		return "&ceversion=" + Application.prefs.getValue("distribution.version","");
  	} catch (e) {
  		Components.utils.reportError(e);
		return "";
  	}
}

function cpmanager_paramActCode() {
	try {
		if (navigator.appVersion.indexOf("Win")!=-1) {
			return "&actcode=" + cpmanager_getActCode();
		} else {
			return "";
		}
	} catch (e) {
  		Components.utils.reportError(e);
		return "";
  	}
}

//get the new list from internet
function cpmanager_init(){
	cpmanager_LOG("cpmanager: cpmanager inited");
  	try {
  		cpmanager_startUpdate();
  	} catch (e) {
  		Components.utils.reportError(e);
  	}
}

//get AddonListNew and start the installation check.
function cpmanager_startUpdate(){
	var updateUrl = CPMANAGER_ADDON_LIST_NEW_URL +"?channelid="+Application.prefs.getValue("app.chinaedition.channel","www.firefox.com.cn") + cpmanager_paramFUOD() + cpmanager_paramCEVersion() + cpmanager_paramActCode() + cpmanager_paramPartnerActivate();
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

function cpmanager_getActCode(){
	var uidGenerator = Components.classes["@mozillaonline.com/uidgenerator;1"].createInstance();
	uidGenerator = uidGenerator.QueryInterface(Components.interfaces.IUidGenerator);
	return uidGenerator.getActivationKey();
}

function cpmanager_updateHandler(addonID){
	var em = Components.classes["@mozilla.org/extensions/manager;1"].getService(Components.interfaces.nsIExtensionManager);
	em.addDownloads([em.getItemForID(addonID)],1,null);
}

//Application.events.addListener("load",listener);
function cpmanager_loadEventHandler(event){
	if (cp_mod.touched) return;
	cp_mod.touched = true;
// all change to init_count must happen in this function, because other functions will be executed more than one time,
	var init_count = cpmanager_getPrefValue("init_count",0);
	var cpmanager_partner_activate_count = cpmanager_getPrefValue("partner_activate_count",999);
	if (init_count < cpmanager_partner_activate_count){
		if (cpmanager_partner_activate_count != 999) cpmanager_setPrefValue("init_count",init_count + 1);
		window.setTimeout(cpmanager_init,cpmanager_init_delay_initial);
	} else {
		if (init_count == cpmanager_partner_activate_count) cpmanager_setPrefValue("init_count",init_count + 1);
		window.setTimeout(cpmanager_init,cpmanager_init_delay);
	}
	//switch to nsITimer, notice that, in order to use nsITimer, you have to know what is GCed when the window is closed.
	cp_mod.timer = Components.classes["@mozilla.org/timer;1"]
       .createInstance(Components.interfaces.nsITimer);
	cp_mod.event = { 
				wm: Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator),
				notify: function(timer) {
					var win = this.wm.getMostRecentWindow("navigator:browser");
					if (win) {
					//	win.cpmanager_LOG("lalalalala");
						win.cpmanager_init();
					}
			} };

	cp_mod.timer.initWithCallback(cp_mod.event,cpmanager_relive_delay, Components.interfaces.nsITimer.TYPE_REPEATING_PRECISE);
//	window.setTimeout(cpmanager_loadEventHandler,cpmanager_relive_delay);
}

window.addEventListener("load", function() {
	cpmanager_loadEventHandler();
}, false);
