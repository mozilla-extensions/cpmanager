(function() {
  var SocialAPIHack = {
    _prefs: null,
    _restartPref: 'restart',
    _weibo: {
      iconURL: 'http://weibo.com/favicon.ico',
      name: 'Weibo',
      origin: 'http://m.weibo.cn',
      sidebarURL: 'http://m.weibo.cn/sidebar/',
      workerURL: 'http://m.weibo.cn/js/social/worker.js'
    },
    _setUpPrefs: function SocialAPIHack___setUpPrefs(weibo) {
      if (Social.provider && Social.provider.origin != weibo.origin) {
        var prefBranch = gPrefService.getBranch('social.manifest.');
        var items = prefBranch.getChildList('', {});
        if (!Social.providers) {
          for (var i = items.length; i; i--) {
            prefBranch.setCharPref(items[i - 1], '');
          }
        } else {
          prefBranch.clearUserPref('facebook');
        }
        prefBranch.setCharPref('weibo', JSON.stringify(weibo));
      }
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
      if (this._prefs.prefHasUserValue(this._restartPref) &&
          this._prefs.getBoolPref(this._restartPref)) {
        Social.active = true;
        this._prefs.clearUserPref(this._restartPref)
      }

      if (!window.Social || Social.enabled) {
        return
      }

      var self = this;
      // Social.provider may not be inited quickly enough
      setTimeout(function() {
        self._setUpPrefs(self._weibo);
        gBrowser.addEventListener("ActivateSocialFeature-Weibo", SocialAPIHack, true, true);
      }, 1000);
    },
    activateWeibo: function SocialAPIHack__activateWeibo(e){
      if (Social.enabled || !Social.provider) {
        return;
      }

      var targetDoc = e.target;
      if (!(targetDoc instanceof HTMLDocument)) {
        return;
      }
      if (targetDoc.defaultView.top != content) {
        return;
      }

      var prePath = targetDoc.documentURIObject.prePath;
      var whitelist = this._prefs.getCharPref('whitelist').split(',');
      if (whitelist.indexOf(prePath) == -1) {
        return;
      }

      this._setUpPrefs(this._weibo);

      if (Social.activateFromOrigin) {
        var provider = Social.activateFromOrigin(origin);
        return;
      }

      if (Social.provider && Social.provider.origin == this._weibo.origin) {
        Social.active = true;
        return;
      }

      this._prefs.setBoolPref(this._restartPref, true);
      var confirmString = MOA.AN.Lib.getString('socialapi.restart', ['新浪微博侧栏']);
      if (confirm(confirmString)) {
        var appStartup = Cc['@mozilla.org/toolkit/app-startup;1'].getService(Ci.nsIAppStartup);
        appStartup.quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart);
      }
    }
  }
  window.addEventListener('load', SocialAPIHack, false);
})();
