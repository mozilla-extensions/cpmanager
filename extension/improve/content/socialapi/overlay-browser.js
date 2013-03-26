(function() {
  var jsm = {};
  try {
    Cu.import("resource://gre/modules/SocialService.jsm", jsm);
  } catch(e) {}

  var SocialAPIHack = {
    lastEventReceived: 0,
    _prefs: null,
    _weibo: {
      iconURL: 'http://weibo.com/favicon.ico',
      name: 'Weibo',
      origin: 'http://m.weibo.cn',
      sidebarURL: 'http://m.weibo.cn/sidebar/',
      workerURL: 'http://m.weibo.cn/js/social/worker.js'
    },
    _ensureWeibo: function SocialAPIHack___ensureWeibo(weibo) {
      jsm.SocialService.getProvider(weibo.origin, function(existedProvider) {
        let prefBranch = gPrefService.getBranch('social.manifest.');
        if (!existedProvider) {
          prefBranch.setCharPref('weibo', JSON.stringify(weibo));

          jsm.SocialService.addProvider(weibo, function() {});
        } else {
          prefBranch.clearUserPref('facebook');
        }
      });
    },
    handleEvent: function SocialAPIHack__handleEvent(aEvent) {
      switch (aEvent.type) {
        case "load":
          this.init();
          break;
        case "ActivateSocialFeature-Weibo":
          this.activateWeibo(aEvent);
          break;
      }
    },
    init: function SocialAPIHack__init(){
      this._prefs = gPrefService.getBranch('extensions.cmimprove.socialapi.');

      if (!(window.Social && Social.activateFromOrigin)) {
        return
      }

      var self = this;
      // Social.provider may not be inited quickly enough
      setTimeout(function() {
        self._ensureWeibo(self._weibo);
        gBrowser.addEventListener("ActivateSocialFeature-Weibo", SocialAPIHack, true, true);
      }, 1000);
    },
    activateWeibo: function SocialAPIHack__activateWeibo(e){
      // from browser/base/content/browser-social.js
      let targetDoc = e.target;
      if (!(targetDoc instanceof HTMLDocument)) {
        return;
      }
      if (targetDoc.defaultView.top != content) {
        return;
      }
      let activateOrigin = targetDoc.nodePrincipal.origin;
      let whitelist = this._prefs.getCharPref('whitelist');
      if (whitelist.split(',').indexOf(activateOrigin) == -1) {
        return;
      }

      if (window.PrivateBrowsingUtils && PrivateBrowsingUtils.isWindowPrivate &&
          PrivateBrowsingUtils.isWindowPrivate(window)) {
        return;
      }

      let now = Date.now();
      if (now - SocialAPIHack.lastEventReceived < 1000) {
        return;
      }
      SocialAPIHack.lastEventReceived = now;

      let oldOrigin = Social.provider ? Social.provider.origin : "";

      let provider = Social.activateFromOrigin(this._weibo.origin);

      if (!provider) {
        return;
      }

      let description = document.getElementById("social-activation-message");
      let brandShortName = document.getElementById("bundle_brand").getString("brandShortName");
      let message = gNavigatorBundle.getFormattedString("social.activated.description",
                                                        [provider.name, brandShortName]);
      description.value = message;

      let notificationPanel = SocialUI.notificationPanel;
      notificationPanel.setAttribute("origin", provider.origin);
      notificationPanel.setAttribute("oldorigin", oldOrigin);

      notificationPanel.hidden = false;
      setTimeout(function () {
        notificationPanel.openPopup(SocialToolbar.button, "bottomcenter topright");
      }, 0);
    },
  }
  window.addEventListener('load', SocialAPIHack, false);
})();
