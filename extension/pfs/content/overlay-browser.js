window.addEventListener("load", function() {
  if(gPluginHandler && gPluginHandler.supportedPlugins){
    gPluginHandler.supportedPlugins.mimetypes["application/qvod-plugin"] = "qvod";
    gPluginHandler.supportedPlugins.plugins["qvod"] = {
      "displayName": "Qvod plugin",
      "installWINNT": true,
    };
  }
},false);
