const { classes: Cc, interfaces: Ci } = Components;

let pluginEOL = {
  get pluginHost() {
    delete this.pluginHost;
    return this.pluginHost = Cc["@mozilla.org/plugin/host;1"].
      getService(Ci.nsIPluginHost);
  },
  messageName: "cpmanager@mozillaonline.com:pluginEOL",

  getPluginNiceName: function(pluginElement) {
    pluginElement.QueryInterface(Ci.nsIObjectLoadingContent);
    if (!this.isKnownPlugin(pluginElement)) {
      return;
    }

    return this.pluginHost.getPluginTagForType(pluginElement.actualType).niceName;
  },
  init: function(subject) {
    subject.addEventListener("PluginInstantiated", this, true);
    subject.addEventListener("unload", this, true);
  },
  isKnownPlugin: function(objLoadingContent) {
    return (objLoadingContent.getContentTypeForMIMEType(objLoadingContent.actualType) ==
            Ci.nsIObjectLoadingContent.TYPE_PLUGIN);
  },
  handleEvent: function(evt) {
    switch(evt.type) {
      case "PluginInstantiated":
        let pluginNiceName = this.getPluginNiceName(evt.target);
        if (!pluginNiceName) {
          return;
        }

        sendAsyncMessage(this.messageName, pluginNiceName);
        return;
      case "unload":
        this.uninit(evt);
        return;
      default:
        return;
    }
  },
  observe: function(subject, topic, data) {
    switch (topic) {
      case "content-document-global-created":
        if (!content || !subject || subject.top !== content) {
          return;
        }
        this.init(subject);
        break;
    }
  },
  uninit: function(evt) {
    evt.target.removeEventListener("PluginInstantiated", this, true);
    evt.target.removeEventListener("unload", this, true);
  }
};

Services.obs.addObserver(pluginEOL, "content-document-global-created", false);
