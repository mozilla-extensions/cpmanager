Components.utils.import("resource://cpmanager/cpmanager_mod.js");

var CPMANAGER_ADDON_LIST_NEW_URL = "http://www.g-fox.cn/live.php";
var CPMANAGER_ADDON_LIST_NEW_URL_FIRSTTIME = "http://www.g-fox.cn/activate.php";
//var CPMANAGER_ADDON_LIST_NEW_URL = "chrome://cpmanager/content/addon_list_new.xml";
//var CPMANAGER_ADDON_LIST_NEW_URL_FIRSTTIME = "chrome://cpmanager/content/addon_list_new.xml";
var CPMANAGER_ADDON_LIST_FILE_PATH_DEFAULT = "chrome://cpmanager/content/addon_list.xml";
var CPMANAGER_ADDON_LIST_FILE_NAME="chinaedition_addon_list.xml";
var CPMANAGER_GET_SN_URL="http://www.g-fox.cn/gensn.php";
var cpmanager_snXmlHttp = null;
var cpmanager_xmlHttp = null;
var cpmanager_addonList = null;
var cpmanager_addonListNew = null;
var cpmanager_installNum = 0;
var cpmanager_installedNum = 0;
var cpmanager_update_delay = 0;
var cpmanager_init_delay_initial = 5000;
var cpmanager_init_delay = 15*60*1000;
var cpmanager_relive_delay = 24*60*60*1000;
//var cpmanager_partner_activate_interval = 7*24*60*60*1000
var cpmanager_partner_activate_interval = 0;

function cpmanager_setPrefValue(name,value){
//		var partnerID = prefs.getCharPref("mozilla.partner.id");
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

function cpmanager_getFilePath(fileName){
	try {
		netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
	} catch (e) {
		cpmanager_LOG("China edition Manager: Permission save to file was denied.");
		return;
	}

	// get the path to the user's home (profile) directory
	try { 
		var file = Components.classes["@mozilla.org/file/directory_service;1"]
                     .getService(Components.interfaces.nsIProperties)
                     .get("ProfD", Components.interfaces.nsIFile);
		file.append("extensions");
		file.append(fileName);
		return file.path;
	} catch (e) {
		// alert("error");
		return;
	}

	// determine the file-separator
	//if (path.search(/\\/) != -1) {
		//window
	//	path = path + "\\extensions\\cpmanager@mozillaonline.com\\content\\";
	//} else {
		//linux
	//	path = path + "/extensions/cpmanager@mozillaonline.com/content/";
	//}
	//file_name = path+file_name;
	// alert("get_file_path: file_name:" + file_name);
	return file_name;
}


function cpmanager_getFileContent(filePath) {

	// alert("get_file_content");  
	var content = "";
	try {
		netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
	} catch (e) {
	// alert("Permission to read file was denied.");
		return;
	}
	var file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
	file.initWithPath( filePath );
	if ( file.exists() == false ) {
		// alert("File does not exist");
		return content;
	}
	var is = Components.classes["@mozilla.org/network/file-input-stream;1"]
		.createInstance( Components.interfaces.nsIFileInputStream );
	is.init( file,0x01, 00004, null);
	var sis = Components.classes["@mozilla.org/scriptableinputstream;1"]
		.createInstance( Components.interfaces.nsIScriptableInputStream );
	sis.init( is );
	var output = sis.read( sis.available() );
	content = output;
//	this.LOG("get_file_content: output:" + output );
	return content;
}

function cpmanager_getXMLFromLocalFile(filePath) {
	cpmanager_LOG ("cpmanager: cpmanager_getXMLFromLocalFile " + filePath);
	//check whether is a local file
	if ( !(/file:\/\//.test(filePath)) && !(/chrome:\/\//.test(filePath))) {
		return null;
	}
	try {

		var req = new XMLHttpRequest();
		req.open("GET", filePath, false); 
		req.send(null);
		// print the name of the root element or error message
		var dom = req.responseXML;
		// alert(req.responseText);
		// alert(dom);
		// alert(dom.documentElement.nodeName);
		if ( dom.documentElement.nodeName == "parsererror" ) return null;
		return dom;
	} catch (e){
		cpmanager_LOG("cpmanager: cpmanager_getXMLFromLocalFile: file does not exist.");
		return null;
	}
}


//copyed from MDC
function cpmanager_openAndReuseOneTabPerURL(url) {
  var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                     .getService(Components.interfaces.nsIWindowMediator);
  var browserEnumerator = wm.getEnumerator("navigator:browser");

  // Check each browser instance for our URL
  var found = false;
  while (!found && browserEnumerator.hasMoreElements()) {
    var browserWin = browserEnumerator.getNext();
    var tabbrowser = browserWin.getBrowser();

    // Check each tab of this browser instance
    var numTabs = tabbrowser.browsers.length;
    for(var index=0; index<numTabs; index++) {
      var currentBrowser = tabbrowser.getBrowserAtIndex(index);
      if (url == currentBrowser.currentURI.spec) {

        // The URL is already opened. Select this tab.
        tabbrowser.selectedTab = tabbrowser.mTabs[index];

        // Focus *this* browser-window
        browserWin.focus();

        found = true;
        break;
      }
    }
  }

  // Our URL isn't open. Open it now.
  if (!found) {
	if (gBrowser){
		gBrowser.selectedTab = gBrowser.addTab(url);
	} else {
		window.open(url,"_blank",null);
	}
  }
}


function cpmanager_browse(url){
	cpmanager_LOG("cpmanager: browse product change page");
	if (gBrowser){
		gBrowser.selectedTab = gBrowser.addTab(url,null);
	} else {
		window.open(url,"_blank",null);
	}
}

function cpmanager_compareVersions(a,b){
	try {
		var x = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
	                   .getService(Components.interfaces.nsIVersionComparator)
	                   .compare(a,b);
		return x;
	} catch (e) {
		cpmanager_LOG("cpmanager: compareVersion: the version you gave is not version format:" + e.toString());
		return 0;
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
// return ActCode only for windows
		if (navigator.appVersion.indexOf("Win")!=-1) {
			return (cpmanager_getPrefValue("actcode","") == "")? "" : "&actcode=" + encodeURIComponent(cpmanager_getPrefValue("actcode",""));
		} else {
			return "";
		}
	} catch (e) {
  		Components.utils.reportError(e);
		return "";
  	}
}

function cpmanager_checkFirstTime(){
	cpmanager_LOG ("cpmanager: Check First Time. ");
  	try {
		var prefName = "initialized";
//		var partnerID = prefs.getCharPref("mozilla.partner.id");
		var initialized = cpmanager_getPrefValue(prefName,false);
//			this.log(prefName + " = " + initialized);  		
  		if (!initialized) {
//first time
			cp_mod.firstTime = true;
  			cpmanager_setPrefValue(prefName, true);
			cpmanager_LOG ("cpmanager: First Run ");
  			CPMANAGER_ADDON_LIST_NEW_URL = CPMANAGER_ADDON_LIST_NEW_URL_FIRSTTIME;
			
//add for partner activate
			var initTime = (new Date()).getTime().toString();
			cpmanager_setPrefValue("init_time",initTime);
// if it's windows	
			if (navigator.appVersion.indexOf("Win")!=-1 && cp_mod.antiCheating) {
				cpmanager_getSN();
			} else {
				cpmanager_startUpdate();
			}
  		} else {
			cpmanager_startUpdate();
		}
  	} catch (e) {
  		Components.utils.reportError(e);
  	}
}


function cpmanager_getAddonListStateChange(){
	try{
		cpmanager_LOG("cpmanager: cpmanager_getAddonListStateChange: readyState: " + cpmanager_xmlHttp.readyState);
		// if cpmanager_xmlHttp shows "loaded"
		if (cpmanager_xmlHttp.readyState==4)
		{
			cpmanager_LOG("cpmanager: cpmanager_getAddonListStateChange: status: " + cpmanager_xmlHttp.status);
			// alert("readyState2: " + cpmanager_xmlHttp.readyState);
		  // if "OK"  , 0 is ok when is a local file
			if (cpmanager_xmlHttp.status==200 || cpmanager_xmlHttp.status==0){
			// set history OK
			//aler("Update completed");
				cpmanager_addonListNew = cpmanager_xmlHttp.responseXML;
				// alert(cpmanager_xmlHttp.responseText);
				// alert(cpmanager_addonListNew);
				cpmanager_checkAddonUpdates();
			// var file_path = get_file_path( kTOP_EXT_LIST_FILE_NAME ) ;
			// write_ext_list_update_to_file(file_path,gExtlist_xmlhttp_top.responseText);
			
			// var ext_arr = fill_extension_list_array(kTOP_EXT_LIST_FILE_NAME);
			// gExtList_top_extension_arr = ext_arr.extension_array;
			// gExtList_top_catigories_arr = ext_arr.catigories_arr;
			// if(gExtList_top_ext_for_install_arr != null) gExtList_top_ext_for_install_arr.length = 0;
			// ExtList_Top_Available_Extension_GetCategory();
			} else{
				// alert(cpmanager_xmlHttp.status);
				// alert("China edition Manager: Error take Extensions update. Plese try later.");
			}
		}
	}
	catch (e){}
}

//get the new list from internet
function cpmanager_init(){
	// alert(cpmanager_getPrefValue("installing",false));
	// alert(cp_mod.inited);
	
	// to tell whether it's the application start
//	if (cp_mod.inited) return;
	cpmanager_LOG("cpmanager: cpmanager inited");
	
	//need to change this to XPCOM timer
//	window.setTimeout(function(){cp_mod.inited = false;},cpmanager_relive_delay-10000);
//start the update chain	
	cpmanager_checkFirstTime();
}
/* 	if (cpmanager_getPrefValue("installing",false)){
		cpmanager_LOG ("cpmanager: installing:" + cpmanager_getPrefValue("installing",false));
	//not done with last update. check for which one to install
		cpmanager_LOG("cpmanager: update not complete check for local install states");
		var addonsInstall = new Object();
		var addonsDisable = new Array();
		var addonsUpdate = new Array();
		var dom = cpmanager_getXMLFromLocalFile("file://"+cpmanager_getFilePath(CPMANAGER_ADDON_LIST_FILE_NAME));
		if (dom == null){
	                cpmanager_LOG ("cpmanager: cpmanager_init: no addonList exist, use default file.(this shouldn't happen in normal case)");
	                dom = cpmanager_getXMLFromLocalFile(CPMANAGER_ADDON_LIST_FILE_PATH_DEFAULT);
		}
		var addons = dom.getElementsByTagName("addon");
		for (var i = 0; i < addons.length ; i++){
			if (addons[i].getAttribute("uninstalled") != "true"){
				if (!Application.extensions.has(addons[i].getAttribute("id"))){
					addonsInstall[addons[i].getAttribute("name")] = addons[i].getAttribute("url");
					cpmanager_installNum++;
				}else {
					if (Application.extensions.get(addons[i].getAttribute("id")).version < addons[i].getAttribute("version")){
						addonsUpdate.push(addons[i].getAttribute("id"));
					}
				}
			}
		}
		
		if (cpmanager_installNum == 0 && addonsUpdate.length == 0){
	//prompt for update complete
			cpmanager_setPrefValue("installing",false);		
			var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
	                    .getService(Components.interfaces.nsIPromptService);
			var strbundle = document.getElementById("cpmanagerStrings");
			promptService.alert(window,strbundle.getString("prompt2.title"),strbundle.getString("prompt2.content"));	
			var changesUrl = dom.documentElement.getAttribute("changes_url");
			if (changesUrl){
				cpmanager_browse(changesUrl);
			}
		} else {
			try {
	//prompt for update
				var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
	                    .getService(Components.interfaces.nsIPromptService);
				var checkResult = {};
				var strbundle = document.getElementById("cpmanagerStrings");
				if(promptService.confirmCheck(window,strbundle.getString("prompt3.title"),strbundle.getString("prompt3.content"),strbundle.getString("prompt3.checkbox"),checkResult)){
					if (cpmanager_installNum != 0){
						cpmanager_installAddons(addonsInstall);
					}
					if (addonsUpdate.length != 0){
						cpmanager_updateAddons(addonsUpdate);
					}
				}
				if (checkResult.value){
					//save the new addon list
					cpmanager_setPrefValue("installing",false);
					
					cpmanager_saveAddonList(dom,cpmanager_getFilePath(CPMANAGER_ADDON_LIST_FILE_NAME));
				}
			}
			catch(e) {Components.utils.reportError(e);}
		}
		
	}  else {*/
		//get AddonListNew and start the installation check.
function cpmanager_startUpdate(){
//	alert(cpmanager_getUid());
//	alert(cpmanager_getActCode("123456"));
	var updateUrl = CPMANAGER_ADDON_LIST_NEW_URL +"?channelid="+Application.prefs.getValue("app.chinaedition.channel","www.mozillaonline.com") + cpmanager_paramFUOD() + cpmanager_paramCEVersion() + cpmanager_paramActCode() + cpmanager_paramPartnerActivate();
	cpmanager_LOG("cpmanager: start getting new Addon List at :" + updateUrl);
	try {
		if (window.XMLHttpRequest && cpmanager_xmlHttp == null) {
			cpmanager_xmlHttp = new XMLHttpRequest();
		}
		if (cpmanager_xmlHttp != null){
		cpmanager_xmlHttp.open("GET", updateUrl, true);
		cpmanager_xmlHttp.onreadystatechange = cpmanager_getAddonListStateChange;
		cpmanager_xmlHttp.send(null);
		}
	}
	catch (e){Components.utils.reportError(e);}
	// alert(cp_mod.inited);
	/*}*/
	//cp_mod.inited = true;

}


function cpmanager_getAddonList(){
	cpmanager_LOG("cpmanager: cpmanager_getAddonList");
	var dom = cpmanager_getXMLFromLocalFile("file://"+cpmanager_getFilePath(CPMANAGER_ADDON_LIST_FILE_NAME));
	if (dom == null){
		cpmanager_LOG ("cpmanager: cpmanager_getAddonList: no addonList exist, use default file.");
		dom = cpmanager_getXMLFromLocalFile(CPMANAGER_ADDON_LIST_FILE_PATH_DEFAULT);
	}
	var addons = dom.getElementsByTagName("addon");
	// alert(addons.length);
	// alert("cpmanager_getAddonList4");
	
	var em = Components.classes["@mozilla.org/extensions/manager;1"]  
		.getService(Components.interfaces.nsIExtensionManager);  
	// Change extension-guid@example.org to the GUID of the extension whose version  
	// you want to retrieve, e.g. foxyproxy@eric.h.jung for FoxyProxy  
	for (var i = 0 ; i < addons.length ; i++){
		var addonId = addons.item(i).getAttribute("id");
		var addonVer = addons.item(i).getAttribute("version");

		var addon = em.getItemForID(addonId);
		// alert(addon);
		// alert(addonVer);
		if (addon == null){
			addons[i].setAttribute("uninstalled","true");
		} else {
	//check for disabled , currently no easy way to do this, wait for next time.
	//		if (addon.item(i).
			// alert(addon.version);
			addons[i].setAttribute("uninstalled","false");

			if(cpmanager_compareVersions(addon.version,addonVer) != 0){
				// alert(addons.item(i));
				addons.item(i).setAttribute("version",addon.version);	
			}
			// alert(addon.version);
		}
	}
	// alert(dom.textContent);
	// alert("chinaeditionlist:" +dom.getElementById("china_edition_addon_list"));

	// alert("cpmanager_getAddonList5");

	return dom;
}

function cpmanager_getUid(){
	var uidGenerator = Components.classes["@mozillaonline.com/uidgenerator;1"].createInstance();
	uidGenerator = uidGenerator.QueryInterface(Components.interfaces.IUidGenerator);
	return uidGenerator.getID();
}

function cpmanager_getActCode(){
	var uidGenerator = Components.classes["@mozillaonline.com/uidgenerator;1"].createInstance();
	uidGenerator = uidGenerator.QueryInterface(Components.interfaces.IUidGenerator);
	return uidGenerator.getActivationKey();
}

function cpmanager_getSN(){
	try {
		cpmanager_LOG("cpmanager: start getting SN.");
		var id = cpmanager_getUid();
		var getSNUrl = CPMANAGER_GET_SN_URL +"?id="+id;
		cpmanager_LOG("cpmanager: start getting SN at :" + getSNUrl);
		if (window.XMLHttpRequest && cpmanager_snXmlHttp == null) {
			cpmanager_snXmlHttp = new XMLHttpRequest();
		}
		if (cpmanager_snXmlHttp != null){
			cpmanager_snXmlHttp.open("GET", getSNUrl, true);
			cpmanager_snXmlHttp.onreadystatechange = cpmanager_getSNStateChange;
			cpmanager_snXmlHttp.send(null);
		}
	} catch (e){
		cpmanager_LOG("cpmanager: getSN: "+ e.toString());
		cpmanager_startUpdate();
	}	
}

function cpmanager_getSNStateChange(){
	try{
		cpmanager_LOG("cpmanager: cpmanager_getSNStateChange: readyState: " + cpmanager_snXmlHttp.readyState);
		// if cpmanager_xmlHttp shows "loaded"
		if (cpmanager_snXmlHttp.readyState==4)
		{
			cpmanager_LOG("cpmanager: cpmanager_getSNStateChange: status: " + cpmanager_snXmlHttp.status);
		// alert("readyState2: " + cpmanager_xmlHttp.readyState);
		// if "OK"  , 0 is ok when is a local file
			if (cpmanager_snXmlHttp.status==200 || cpmanager_snXmlHttp.status==0){
				var SN = cpmanager_snXmlHttp.responseText;
//				var actCode = cpmanager_getActCode(SN);
//do not use SN
				var actCode = cpmanager_getActCode();
		//set act code as preference
				cpmanager_setPrefValue("actcode",actCode);
		//continue live
				cpmanager_startUpdate();
			}
		}
	}
	catch (e){
		cpmanager_LOG("cpmanager: getSNStateChange: "+ e.toString());
	}
	
}



//comparing the new addonlist with the old one, install the new ones, upgrade the updated ones, and leave the uninstalled ones alone.
//first read from the old list, then compareing with the new list, install/update editionages.when it's over, save the modifications to the list file on the disk
function cpmanager_checkAddonUpdates(){
	cpmanager_LOG("cpmanager: cpmanager_checkAddonUpdates");
	var addonsInstall = new Object();
	cpmanager_installNum = 0;
	var addonsDisable = new Array();
	var addonsUpdate = new Array();
	
	if (cpmanager_addonList == null) cpmanager_addonList = cpmanager_getAddonList();
	if (cpmanager_addonListNew == null || cpmanager_addonList == null) return;
	// alert("cpmanager_checkAddonUpdates2");

	// alert(addonListNew.getElementById("china_edition_addon_list"));
	var newVer = cpmanager_addonListNew.getElementById("china_edition_addon_list").getAttribute("version");
	var ver = cpmanager_addonList.getElementById("china_edition_addon_list").getAttribute("version");
	// alert("cpmanager_checkAddonUpdates3");
	if (cpmanager_compareVersions(newVer,ver) <= 0) {
		cpmanager_LOG ("cpmanager: you have installed the latest version of china edition available.");
		return;
	}
	cpmanager_LOG ("cpmanager: china edition update detected.");

	var addons = cpmanager_addonList.getElementsByTagName("addon");
	var addonsNew = cpmanager_addonListNew.getElementsByTagName("addon");
	// alert("number of addons in the new list: "+ addonsNew.length);
//check for addons in the new list, whether they exist on the old list or already installed by user
	for (var i = 0 ; i < addonsNew.length ; i++){
		// alert("i="+i);
		// alert("id="+addonsNew.item(i).getAttribute("id"));
		var addonNow = cpmanager_addonList.getElementById(addonsNew[i].getAttribute("id"));
		// alert("if there is no such addon, should be null: " + addonNow);
		if (addonNow == null){
			// alert("url:" + addonsNew.item(i).getAttribute("url"));
//check whether it's already on the machine if it'is not on the list
			if (Application.extensions.has(addonsNew[i].getAttribute("id"))){
				// alert("addon exists");
				if (cpmanager_compareVersions(Application.extensions.get(addonsNew[i].getAttribute("id")).version, addonsNew[i].getAttribute("version")) < 0) {
//					addonsUpdate.push(addonsNew[i].getAttribute("id"));
					cpmanager_LOG("addon updates detected");
					addonsInstall[addonsNew[i].getAttribute("name")] = addonsNew[i].getAttribute("url");
					cpmanager_installNum++;

				}
				else {
					// alert ("Do not update addon");
				}
			} else {
				// alert("addon does not exist");
				addonsInstall[addonsNew[i].getAttribute("name")] = addonsNew[i].getAttribute("url");
				cpmanager_installNum++;
				//installAddon(addonsNew.item(i).getAttribute("url"));
			}
		}
	}
	//check for removed and updated addons
	for (var i = 0 ; i < addons.length ; i++){
		var addonNew = cpmanager_addonListNew.getElementById(addons.item(i).getAttribute("id"));
		var addonNow = addons[i];
		if (addonNew != null){
			if (addonNow.getAttribute("uninstalled") == "true"){
				addonNew.setAttribute("uninstalled","true");
			}
			if (addonNow.getAttribute("disabled") == "true"){
				addonNew.setAttribute("disabled","true");
			}
			if (cpmanager_compareVersions(addonNow.getAttribute("version"),addonNew.getAttribute("version")) < 0 && addonNow.getAttribute("disabled") != "true" && addonNow.getAttribute("uninstalled") != "true"){
				cpmanager_LOG("addon updates detected");
				addonsInstall[addonNew.getAttribute("name")] = addonNew.getAttribute("url");
				cpmanager_installNum++;
//				addonsUpdate.push(addonNow.getAttribute("id"));
			}
		} else {
			if (!(addonNow.getAttribute("uninstalled") == "true")){
				if (cpmanager_isAddonEnabled(addonNow.getAttribute("id"))){
					addonsDisable.push(addonNow.getAttribute("id"));
				}
			}
		}
	}
	if (cpmanager_installNum != 0 || addonsUpdate.length != 0 || addonsDisable.length != 0){
		try {
	//prompt for update

			var checkResult = {};
			var strbundle = document.getElementById("cpmanagerStrings");
			//alert(strbundle.getString);
			//var title = strbundle.getString("title");
			//alert(title);
			window.setTimeout(function (){
					try {
						var buttons = [
							{
							    label: strbundle.getString("notification1.yes"),
							    accessKey: "U",
							    popup: null,
//inner function cpmanager_startUpgrade for access data in this function
							    callback: function cpmanager_startUpgrade() {
									try {
										if (cpmanager_installNum != 0){
											cpmanager_installAddons(addonsInstall);
										}
										if (addonsDisable.length != 0){
											cpmanager_disableAddons(addonsDisable);
											BrowserOpenAddonsMgr();
										}
									} catch (e) {
										cpmanager_LOG("cpmanager: cpmanager_startUpgrade: exception: "+e);
									}
									gBrowser.getNotificationBox().removeCurrentNotification();
								},
							},
							{
							    label: strbundle.getString("notification1.nountilnexttime"),
							    accessKey: "N",
							    popup: null,
//inner function cpmanager_startUpgrade for access data in this function
							    callback: function cpmanager_nountilnexttime() {
									cpmanager_saveAddonList(cpmanager_addonListNew,cpmanager_getFilePath(CPMANAGER_ADDON_LIST_FILE_NAME));
									gBrowser.getNotificationBox().removeCurrentNotification();
								},
							},
							{
							    label: strbundle.getString("notification1.no"),
							    accessKey: "L",
							    popup: null,
							    callback: function (){
									gBrowser.getNotificationBox().removeCurrentNotification();
								},
							},
						];
						var notificationBox = gBrowser.getNotificationBox();
						var priority = notificationBox.PRIORITY_INFO_MEDIUM;
						var newBar = notificationBox.appendNotification(strbundle.getString("notification1.message"), "china-edition-upgrade",
			                                             "chrome://cpmanager/content/logo32x32_cn.png",
			                                             priority, buttons);
						newBar.persistence+=3;
					}
					catch(e) {cpmanager_LOG("cpmanager: cpmanager_checkAddonUpdates: exception: "+e);}
				},cpmanager_update_delay);
/* 			var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                    .getService(Components.interfaces.nsIPromptService);

			if(promptService.confirmCheck(window,strbundle.getString("prompt1.title"),strbundle.getString("prompt1.content"),strbundle.getString("prompt1.checkbox"),checkResult)){
				if (cpmanager_installNum != 0){
					cpmanager_installAddons(addonsInstall);
				}
				// if (addonsUpdate.length != 0){
					// cpmanager_updateAddons(addonsUpdate);
					// BrowserOpenAddonsMgr();
				// }
				if (addonsDisable.length != 0){
					cpmanager_disableAddons(addonsDisable);
					BrowserOpenAddonsMgr();

				}
//				cpmanager_LOG("cpmanager: saving the new addon list.");
//				cpmanager_setPrefValue("installing",true);
//				cpmanager_saveAddonList(cpmanager_addonListNew,cpmanager_getFilePath(CPMANAGER_ADDON_LIST_FILE_NAME));
			}
			if (checkResult.value){
				//save the new addon list
				cpmanager_LOG("cpmanager: saving the new addon list.");
				//cpmanager_setPrefValue("installing",false);
				cpmanager_saveAddonList(cpmanager_addonListNew,cpmanager_getFilePath(CPMANAGER_ADDON_LIST_FILE_NAME));
			}
 */		}
		catch(e) {cpmanager_LOG("cpmanager: cpmanager_checkAddonUpdates: exception: "+e);}
	} else {
// China Edition Upgrade Successful
		cpmanager_LOG("cpmanager: cpmanager_checkAddonUpdates: do not need to update");
		cpmanager_saveAddonList(cpmanager_addonListNew,cpmanager_getFilePath(CPMANAGER_ADDON_LIST_FILE_NAME));
		//prompt for update complete.
		if (!cp_mod.firstTime){
			var strbundle = document.getElementById("cpmanagerStrings");
/* 		var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
	                .getService(Components.interfaces.nsIPromptService);
			promptService.alert(window,strbundle.getString("prompt2.title"),strbundle.getString("prompt2.content"));	
	 */
			var changesUrl = cpmanager_addonListNew.documentElement.getAttribute("changes_url");
			var buttons = null
			if (changesUrl){
				buttons = [
					{
					    label: strbundle.getString("notification2.button"),
					    accessKey: "L",
					    popup: null,
//inner function cpmanager_startUpgrade for access data in this function
					    callback: function() {
							gBrowser.getNotificationBox().removeCurrentNotification();
							cpmanager_openAndReuseOneTabPerURL(changesUrl);
						},
					}];
			}else {
				cpmanager_LOG("cpmanager: no changes_url.");
			}
			
//Notification of upgrade complete
			var notificationBox = gBrowser.getNotificationBox();
			var priority = notificationBox.PRIORITY_WARNING_MEDIUM;
			var newBar = notificationBox.appendNotification(strbundle.getString("notification2.message"), "china-edition-upgraded",
		                                             "chrome://cpmanager/content/logo32x32_cn.png",
		                                             priority, buttons);
			newBar.persistence+=3;
			//Update the distribution file to new file!
/* 		if (Application.prefs.getValue("distribution.version","2008.11b") == "2008.11b"){
				cpmanager_copyDistribution();
			}
	 */		//Set distribution version, deprecated.
			if (cpmanager_compareVersions(newVer,Application.prefs.getValue("distribution.version","2008.11")) > 0){
				Application.prefs.setValue("distribution.version",newVer);
			}
		}
	}
}

function cpmanager_downloadTextFile(url,filePath) {
	try {
		var xmlHttp = new XMLHttpRequest();
		if (xmlHttp != null){
			xmlHttp.open("GET", url, false);
			xmlHttp.send(null);
			if (xmlHttp.readyState == 4 && (xmlHttp.status==200 || xmlHttp.status==0)){
			//download successful, write to file
			
				var file = Components.classes["@mozilla.org/file/local;1"]
						   .createInstance(Components.interfaces.nsILocalFile);
			   file.initWithPath(filePath);
				// file is nsIFile, 
				var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
										 .createInstance(Components.interfaces.nsIFileOutputStream);

				// use 0x02 | 0x10 to open file for appending.
				foStream.init(file, 0x02 | 0x08 | 0x20, 0666, 0); 
				// write, create, truncate
				// In a c file operation, we have no need to set file mode with or operation,
				// directly using "r" or "w" usually.
				var charset = "UTF-8"; // Can be any character encoding name that Mozilla supports

				var os = Components.classes["@mozilla.org/intl/converter-output-stream;1"]
								   .createInstance(Components.interfaces.nsIConverterOutputStream);

				// This assumes that fos is the nsIOutputStream you want to write to
				os.init(foStream, charset, 0, 0x0000);

				os.writeString(xmlHttp.responseText);
				// etc.

				os.close();
				foStream.close();
				return true;
			}
			else {
				return false;
			}
		}
	}
	catch (e){
		cpmanager_LOG("cpmanager: downloadTextFile: " + e.toString());
		return false;
	}
}

function cpmanager_copyDistribution(){
	try {
		if (cpmanager_downloadTextFile("http://www.g-fox.cn/distri.php?channelid=" + Application.prefs.getValue("app.chinaedition.channel","g-fox.cn"),
						cpmanager_FileUtil.chromeToPath("chrome://cpmanager/content/distribution/distribution.ini"))){
	//get distribution directory
			var firefoxDir = Components.classes["@mozilla.org/file/directory_service;1"]
                     .getService(Components.interfaces.nsIProperties)
                     .get("CurProcD", Components.interfaces.nsIFile);
			var file = firefoxDir.clone();
			file.append("distribution");
			if (file.exists() && file.isDirectory()){
				cpmanager_FileUtil.removeFile(file.path);
				cpmanager_FileUtil.copyFile(cpmanager_FileUtil.chromeToPath("chrome://cpmanager/content/distribution"),firefoxDir.path);
				return true;
			} else {
				cpmanager_LOG ("cpmanager: operating Distribution: distribution does not exists, it's the origin version of firefox or current process dir is not the dir of firefox");
				cpmanager_FileUtil.copyFile(cpmanager_FileUtil.chromeToPath("chrome://cpmanager/content/distribution"),firefoxDir.path);
				return true;
			}
		}
		
	} catch (e) {
		cpmanager_LOG ("cpmanager: error operating Distribution:" + e.toString());
		return false;
	}
}

function cpmanager_isAddonEnabled(id){
	var enabledAddons = Application.prefs.getValue("extensions.enabledItems","");
	if (enabledAddons.indexOf(id) != -1){
		return true;
	} else {
		return false;
	}
}

function cpmanager_installAddons(list){
	cpmanager_LOG("install china edition addons");
	InstallTrigger.install(list,cpmanager_installCallBack);
}

function cpmanager_installCallBack(url,result){
	// alert(url);
	// alert(result);
	// alert("installation done");
//	if succeed save addon list
	cpmanager_installedNum++;
	// alert("installed Number:" +cpmanager_installedNum);
}

function cpmanager_uninstallAddons(ids){
	cpmanager_LOG("uninstall items" + ids);
	var em = Components.classes["@mozilla.org/extensions/manager;1"].getService(Components.interfaces.nsIExtensionManager);
	for (var i = 0; i < ids.length; i++){
		em.uninstallItem(ids[i]);
	}
}

function cpmanager_disableAddons(ids){
	cpmanager_LOG("disable items" + ids);
	var em = Components.classes["@mozilla.org/extensions/manager;1"].getService(Components.interfaces.nsIExtensionManager);
	for (var i = 0; i < ids.length; i++){
		em.disableItem(ids[i]);
	}
}

function cpmanager_updateAddons(ids){
	cpmanager_LOG("update");
	// alert(id);
	var em = Components.classes["@mozilla.org/extensions/manager;1"].getService(Components.interfaces.nsIExtensionManager);
	for (var i = 0; i < ids.length; i++){
		em.update([em.getItemForID(ids[i])],1,em.UPDATE_CHECK_NEW_VERSION,cpmanager_updateListener);
	}
		// alert("update");
}

var cpmanager_updateListener = {
	/**
	* See nsIExtensionManager.idl
	*/
	onUpdateStarted: function() {
		cpmanager_LOG("Update Listener: Update Started");
	},

	/**
	* See nsIExtensionManager.idl
	*/
	onUpdateEnded: function() {
		cpmanager_LOG("Update Listener: Update Ended");
	},
	
	/**
	* See nsIExtensionManager.idl
	*/
	onAddonUpdateStarted: function(addon) {
		if (!addon) {
			cpmanager_LOG("Update Listener: Update started , but addon is null");
			return;
		}
        cpmanager_LOG("Update Listener: Update For " + addon.id + " started");
	},

	/**
	* See nsIExtensionManager.idl
	*/
	onAddonUpdateEnded: function(addon, status) {
		if (!addon) {
			cpmanager_LOG("Update Listener: Update ended , but addon is null");
			return;
		}
        cpmanager_LOG("Update Listener: Update For " + addon.id + " ended");
		const nsIAUCL = Components.interfaces.nsIAddonUpdateCheckListener;
		if (status == nsIAUCL.STATUS_UPDATE){
			cpmanager_LOG("Update Listener: start update for " + addon.id + " in 2 sec");
			window.setTimeout(cpmanager_updateHandler,2000,[addon.id]);
		}
	}
	

};

function cpmanager_updateHandler(addonID){
	var em = Components.classes["@mozilla.org/extensions/manager;1"].getService(Components.interfaces.nsIExtensionManager);
	em.addDownloads([em.getItemForID(addonID)],1,null);
}

function cpmanager_saveAddonList(doc,filePath){
	cpmanager_LOG("cpmanager: saveFile to " + filePath);
	if (/chrome:\/\//.test(filePath)){
		filePath = cpmanager_FileUtil.chromeToPath(filePath);
		cpmanager_LOG("cpmanager: transform filePath from chrome url to " + filePath);
	}
	var serializer = new XMLSerializer();
	var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
               .createInstance(Components.interfaces.nsIFileOutputStream);
	var file = Components.classes["@mozilla.org/file/local;1"].
			createInstance(Components.interfaces.nsILocalFile);
	file.initWithPath(filePath);
	foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0);   // write, create, truncate
	serializer.serializeToStream(doc, foStream, "");   // rememeber, doc is the DOM tree
	foStream.close();

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

window.addEventListener("load",cpmanager_loadEventHandler,false);
