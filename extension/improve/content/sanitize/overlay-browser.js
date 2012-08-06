var ce_sanitizeHistory = {
  onPopupShowing: function(){
    var selClose = Application.prefs.getValue("privacy.sanitize.sanitizeOnShutdown",false);
//    var sel7Days = Application.prefs.getValue("privacy.sanitize.sanitize7Days",false);
    if(selClose)
      document.getElementById("ce_sanitizeHistory_onclose").setAttribute("checked","true");
//    else if(sel7Days)
//      document.getElementById("ce_sanitizeHistory_7days").setAttribute("checked","true");
    else
      document.getElementById("ce_sanitizeHistory_none").setAttribute("checked","true");
      
  },
  onPopupHiding: function(){
    var selClose = document.getElementById("ce_sanitizeHistory_onclose").getAttribute("checked") =="true";
//    var sel7Days = document.getElementById("ce_sanitizeHistory_7days").getAttribute("checked") =="true";
    Application.prefs.setValue("privacy.sanitize.sanitizeOnShutdown",selClose);
//    Application.prefs.setValue("privacy.sanitize.sanitize7Days",sel7Days);
  },
};