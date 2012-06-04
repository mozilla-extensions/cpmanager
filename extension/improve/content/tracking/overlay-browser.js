Components.utils.import("resource://gre/modules/Services.jsm");
var ce_tracking = {
  ceTracking : Cc["@mozilla.com.cn/tracking;1"].getService().wrappedJSObject,
  track : function(key){
    this.ceTracking.track(key);
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
                ,{"type":"event","data":["personas-toolbar-button","click"],"key":"personas-tb"}
                ,{"type":"event","data":["mn-mailnotifier-status-icon","click"],"key":"mailnotifier"}
                ,{"type":"event","data":["muter-toolbar-palette-button","click"],"key":"muter"}
                ];
var init_once = false;
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
      }
    }catch(e){}
  }
}
function stopTracking(){
  ce_tracking.unHookObs();
}   

window.addEventListener('load', startTracking, false)
window.addEventListener('close', stopTracking, false)
})();
