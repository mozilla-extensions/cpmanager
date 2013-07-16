Components.utils.import("resource://gre/modules/Services.jsm");
var ce_tracking = {
  ceTracking : Cc["@mozilla.com.cn/tracking;1"].getService().wrappedJSObject,
  track : function(key){
    this.ceTracking.track(key);
  },
  // 检查prefs
  hookPrefs : function(prefs,key){
    var value = Application.prefs.getValue(prefs,"");
    this.ceTracking.trackPrefs(key,value.toString());
  },
  // 监视 node 的 event
  hookEvent : function(id,event,key){
    var ele = document.getElementById(id)
    var myFunc = function(){ce_tracking.track(key || (id + "-" + event))};
    ele && ele.addEventListener(event,myFunc,false);
  },
  // 监视obs 制定的topic\data
  observers : [],
  hookObs : function(topic,data,key){
    var tracking = ce_tracking;
    var obj = {
      observe : function(s, t, d){
        if(t == topic && (!data || d == data))
          tracking.track(key || (topic + "-" + data));
      },
    };
    tracking.observers.push({ obj : obj , topic : topic });
    Services.obs.addObserver(obj, topic, false);
  },
  unHookObs : function(){
    var arr = ce_tracking.observers;
    for(var i = 0 ; i < arr.length; i++){
      try{
        Services.obs.removeObserver(arr[i].obj, arr[i].topic);
      }catch(e){}
    }
  },
  // 替换函数部分源码
  hookCode : function (orgFunc, key) {
    var orgCode = /{/;
    var myCode = "$& ce_tracking.track('" + key + "');"
    try {
      if (eval(orgFunc).toString() == eval(orgFunc + "=" + eval(orgFunc).toString().replace(orgCode, myCode)))
        throw orgFunc;
    } catch (e) {
    }
  },
};

(function() {
var tracking = ce_tracking;
var trackList = [{"type":"event","data":["searchbar","focus"],"key":"searchbarfocus"}
                ,{"type":"obs","data":["browser-search-engine-modified","engine-current"],"key":"changesearchengine"}
                ,{"type":"event","data":["star-button","click"],"key":"starclick"}
                ,{"type":"method","data":["PlacesCommandHook.bookmarkCurrentPage"],"key":"bookmarkthis"}
                ,{"type":"event","data":["lm-snapshot-button","click"],"key":"snapshot"}
                ,{"type":"event","data":["lm-snapshot-entire","click"],"key":"snapshotentire"}
                ,{"type":"event","data":["lm-snapshot-visible","click"],"key":"snapshotvisible"}
                ,{"type":"event","data":["favpart-button","click"],"key":"favpart"}
                ,{"type":"event","data":["quickluanch-addonbar","click"],"key":"quickluanch"}
                ,{"type":"event","data":["share-all-cn-bar","click"],"key":"shareall"}
                ,{"type":"event","data":["tcfontsetter","click"],"key":"fontsetter"}
                ,{"type":"event","data":["tczoompanel","click"],"key":"zoompanel"}
                ,{"type":"event","data":["tczoompanel_zoom_in","click"],"key":"tczoompanel_zoom_in"}
                ,{"type":"event","data":["tczoompanel_zoom_out","click"],"key":"tczoompanel_zoom_out"}
                ,{"type":"event","data":["tczoompanel_zoom_50","click"],"key":"tczoompanel_zoom_50"}
                ,{"type":"event","data":["tczoompanel_zoom_75","click"],"key":"tczoompanel_zoom_75"}
                ,{"type":"event","data":["tczoompanel_zoom_100","click"],"key":"tczoompanel_zoom_100"}
                ,{"type":"event","data":["tczoompanel_zoom_125","click"],"key":"tczoompanel_zoom_125"}
                ,{"type":"event","data":["tczoompanel_zoom_150","click"],"key":"tczoompanel_zoom_150"}
                ,{"type":"event","data":["tczoompanel_zoom_200","click"],"key":"tczoompanel_zoom_200"}
                ,{"type":"event","data":["tczoompanel_zoom_300","click"],"key":"tczoompanel_zoom_300"}
                ,{"type":"event","data":["tczoompanel_global","click"],"key":"tczoompanel_global"}
                ,{"type":"event","data":["tczoompanel","click"],"key":"zoompanel"}
                ,{"type":"event","data":["personas-toolbar-button","click"],"key":"personas-tb"}
                ,{"type":"event","data":["mn-mailnotifier-status-icon","click"],"key":"mailnotifier"}
                ,{"type":"event","data":["muter-toolbar-palette-button","click"],"key":"muter"}
                ,{"type":"event","data":["ce-undo-close-toolbar-button","click"],"key":"undoclosetab"}
                ,{"type":"event","data":["ce_privateBrowser","click"],"key":"privateBrowser-tb"}
                ,{"type":"event","data":["ntabimprove","click"],"key":"ntabimprove"}
                ,{"type":"event","data":["ntabimprove_closetab_dblclick","click"],"key":"ntabimprove_closetab_dblclick"}
                ,{"type":"event","data":["ntabimprove_closetab_mclick","click"],"key":"ntabimprove_closetab_mclick"}
                ,{"type":"event","data":["ntabimprove_closetab_rclick","click"],"key":"ntabimprove_closetab_rclick"}
                ,{"type":"event","data":["ntabimprove_loadInBackground_disable","click"],"key":"ntabimprove_loadInBackground_disable"}
                ,{"type":"event","data":["ntabimprove_loadInBackground_enable","click"],"key":"ntabimprove_loadInBackground_enable"}
                ,{"type":"event","data":["ntabimprove_setting","click"],"key":"ntabimprove_setting"}
                ,{"type":"event","data":["ce_sanitizeHistory","click"],"key":"ce_sanitizeHistory"}
                ,{"type":"event","data":["ce_sanitizeHistory_none","click"],"key":"ce_sanitizeHistory_none"}
                ,{"type":"event","data":["ce_sanitizeHistory_daily","click"],"key":"ce_sanitizeHistory_daily"}
                ,{"type":"event","data":["ce_sanitizeHistory_weekly","click"],"key":"ce_sanitizeHistory_weekly"}
                ,{"type":"event","data":["ce_sanitizeHistory_monthly","click"],"key":"ce_sanitizeHistory_monthly"}
                ,{"type":"event","data":["ce_sanitizeHistory_quarterly","click"],"key":"ce_sanitizeHistory_quarterly"}
                ,{"type":"event","data":["ce_sanitizeHistory_yearly","click"],"key":"ce_sanitizeHistory_yearly"}
                ,{"type":"event","data":["ce_sanitizeHistory_onclose","click"],"key":"ce_sanitizeHistory_onclose"}
                ,{"type":"event","data":["ce_sanitizeHistory_dialog","click"],"key":"ce_sanitizeHistory_dialog"}

                ,{"type":"event","data":["social-provider-button","click"],"key":"social-provider-button"}
                ,{"type":"event","data":["social-notification-container-message","click"],"key":"social-provider-message"}

                ,{"type":"event","data":["ce_easyscreenshot","click"],"key":"ce_easyscreenshot"}
                ,{"type":"event","data":["easyscreenshot-snapshot-select","click"],"key":"easyscreenshot-snapshot-select"}
                ,{"type":"event","data":["easyscreenshot-snapshot-entire","click"],"key":"easyscreenshot-snapshot-entire"}
                ,{"type":"event","data":["easyscreenshot-snapshot-visible","click"],"key":"easyscreenshot-snapshot-visible"}
                ];
var init_once = false;
function trackSocial(){
  try{
    var enabled = (Application.prefs.getValue("social.enabled", false) == true);
    tracking.ceTracking.trackPrefs("social-enabled", enabled ? '1' : '0');

    var hasWeibo = (Application.prefs.getValue("social.manifest.weibo", "") != "");
    tracking.ceTracking.trackPrefs("social-weibo-install", hasWeibo ? '1' : '0');

    var currentWeibo = (Application.prefs.getValue("social.provider.current", "") == "http://m.weibo.cn");
    tracking.ceTracking.trackPrefs("social-weibo-current", currentWeibo ? '1' : '0');

    var activeWeibo = !! JSON.parse(Application.prefs.getValue("social.activeProviders", "{}"))["http://m.weibo.cn"];
    tracking.ceTracking.trackPrefs("social-weibo-active", activeWeibo ? '1' : '0');
  } catch(e) {
    Application.console.log(e)
  }
}
function startTracking(){
  if(init_once)
    return;
  init_once = true;
  var arr = trackList;
  for(var i = 0 ; i < arr.length ; i++){
    try{
      var obj = arr[i];
      switch(obj.type){
        case "event":
          tracking.hookEvent(obj.data[0],obj.data[1],obj.key);
          break;
        case "obs":
          tracking.hookObs(obj.data[0],obj.data[1],obj.key);
          break;
        case "method":
          tracking.hookCode(obj.data[0],obj.key);
          break;
        case "prefs":
          tracking.hookPrefs(obj.data[0],obj.key);
          break;
      }
    }catch(e){}
  }
  trackSocial();
}
function stopTracking(){
  ce_tracking.unHookObs();
}

window.addEventListener('load', startTracking, false)
window.addEventListener('close', stopTracking, false)
})();
