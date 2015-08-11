/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = [];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://cmaddoninstaller/common.js");
Cu.import("resource://gre/modules/AddonManager.jsm");

var xpiProvider = null;
try {
  xpiProvider = Cu.import('resource://gre/modules/addons/XPIProvider.jsm', {});
} catch(e) {
  // Before FF 30.
  xpiProvider = Cu.import('resource://gre/modules/XPIProvider.jsm', {});
}

var stringBundle = (function() {
  var stringBundleService = Cc['@mozilla.org/intl/stringbundle;1']
                              .getService(Ci.nsIStringBundleService);

  var stringBundle =
    stringBundleService.createBundle('chrome://cmaddoninstaller/locale/locale.properties');

  return {
    getString: function(strName) {
      return stringBundle.GetStringFromName(strName);
    },

    getFormattedString: function(strName, values) {
      return stringBundle.formatStringFromName(strName, values, values.length);
    }
  }
})();

/**
 * Installer service.
 */
cpAddonInstaller.InstallerService = {
  /* Global installation key.*/
  _INSTALLATION_COMPLETE_TIME_PREFKEY: cpAddonInstaller.PrefBranch + "installation.completedtime",
  /* Prevent addon manager preference key. */
  _PREVENT_PREFKEY : cpAddonInstaller.PrefBranch + "prevent.addonManager",
  /* Store the warn on restart preference key. */
  _WARNONRESTART_PREFKEY : cpAddonInstaller.PrefBranch + "store.warnOnRestart",
  /* Store the check default browser preference key. */
  _DEFAULTBROWSER_PREFKEY : cpAddonInstaller.PrefBranch + "store.defaultBrowser",

  /* Logger for this object. */
  _logger: null,
  /* Extension manager. */
  _extensionManager: null,
  /* Version comparator. */
  _versionComparator: null,
  /* Preference service. */
  _preferenceService: null,
  /* Xul runtime service. */
  _xulRuntime: null,

  /**
   * Initializes the component.
   */
  _init: function() {
    this._logger = cpAddonInstaller.getLogger("cpAddonInstaller.InstallerService");
    this._logger.trace("_init");

    this._extensionManager = AddonManager;
    this._versionComparator =
      Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);
    this._preferenceService =
      Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
    this._xulRuntime =
      Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime);
  },

  findWindow: function() {
    var windowMediator =
      Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
    var wnd = windowMediator.getMostRecentWindow('navigator:browser');

    if (!wnd) {
      wnd = windowMediator.getMostRecentWindow('');
    }
    return wnd;
  },

  getChromeWindow: function() {
    return this.findWindow().QueryInterface(Ci.nsIInterfaceRequestor)
                            .getInterface(Ci.nsIWebNavigation)
                            .QueryInterface(Ci.nsIDocShellTreeItem)
                            .rootTreeItem.QueryInterface(Ci.nsIInterfaceRequestor)
                            .getInterface(Ci.nsIDOMWindow);
  },

  /**
   * Prevents the addon manager window from being showed by removing the value.
   */
  preventAddonManager: function() {
    this._logger.debug("preventAddonManager");

    let preventPref =
      cpAddonInstaller.Application.prefs.get(this._PREVENT_PREFKEY);

    if (preventPref && preventPref.value) {
      let newAddonsPref =
        cpAddonInstaller.Application.prefs.get("extensions.newAddons");
      let warnOnRestart =
        cpAddonInstaller.Application.prefs.get(this._WARNONRESTART_PREFKEY);
      let defaultBrowser =
        cpAddonInstaller.Application.prefs.get(this._DEFAULTBROWSER_PREFKEY);

      this._preferenceService.clearUserPref(this._PREVENT_PREFKEY);

      if (newAddonsPref) {
        this._preferenceService.clearUserPref("extensions.newAddons");
      }
      if (warnOnRestart) {
        cpAddonInstaller.Application.prefs.setValue(
          "browser.warnOnRestart", warnOnRestart.value);
        this._preferenceService.clearUserPref(this._WARNONRESTART_PREFKEY);
      }
      if (defaultBrowser) {
        cpAddonInstaller.Application.prefs.setValue(
          "browser.shell.checkDefaultBrowser", defaultBrowser.value);
        this._preferenceService.clearUserPref(this._DEFAULTBROWSER_PREFKEY);
      }
    }
  },

  /**
   * Starts the install process.
   */
  startInstallProcess: function() {
    this._logger.debug("startInstallProcess");
    let installTimePref = cpAddonInstaller.Application.prefs.get(this._INSTALLATION_COMPLETE_TIME_PREFKEY);
    this._logger.debug('install.date: ' + this._getInstallTime());
    if (installTimePref && installTimePref.value != this._getInstallTime()/*&& curRetry < maxRetry*/) {
      if (!this._installExtensions()) {
        this._logger.info('No addons should be installed.');
      }
    }
  },

  _addonNumHandled: 0,
  _restartRequired: false,

  /**
   * Installs the extensions.
   */
  _installExtensions: function() {
    this._logger.info("_installExtensions");

    let extensionArray = this._getExtensionsToInstall();
    if (extensionArray.length == 0) {
        return false;
    }

    let extensionInstalled = null;
    let allExtensionsInstalled = true;

    this._addonNumHandled = extensionArray.length;
    this._logger.info(this._addonNumHandled + ' extensions to be installed: ' + extensionArray.join(';'));

    var self = this;
    for (let i = 0; i < extensionArray.length; i++) {
      this._installExtension(extensionArray[i], function(aExtInfo, extensionInstalled) {
        self._logger.info('Installation for ' + aExtInfo.id + ': ' + extensionInstalled);

        // increase addon number have been installed.
        if (extensionInstalled) {
          if (aExtInfo.pendingOperations != AddonManager.PENDING_NONE) {
            self._restartRequired = true;
          }
        }

        self._addonNumHandled -= 1;
        if (self._addonNumHandled == 0) {
          self._logger.info('All installation is finished.');

          if (self._restartRequired) {
            var chromeWindow = self.getChromeWindow();
            chromeWindow.PopupNotifications.show(chromeWindow.gBrowser.selectedBrowser,
              "addoninstaller-popup",
            stringBundle.getString('popupnotification.message'), null, /* anchor ID */ {
              label: stringBundle.getString('popupnotification.action.restart'),
              accessKey: "R",
              callback: function() {
                self._setRestartPreferences();
                self._restartFirefox();
              }
            }, null,  /* secondary action */
            {
              removeOnDismissal: true,
              persistWhileVisible: true,
              persistence: 100
            });
          } else {
            self._logger.info('No addon is installed');
          }

          cpAddonInstaller.Application.prefs.setValue(self._INSTALLATION_COMPLETE_TIME_PREFKEY, self._getInstallTime());
        }
      });
    }

    return true;
  },

  /**
   * Install a extension.
   * @param aExtInfo the extension info.
   * @return true if everything finished fine, false otherwise.
   */
  _installExtension: function(aExtInfo, callback) {
    this._logger.info("_installExtension");

    let extensionInstalled = true;

    if (null == aExtInfo || !aExtInfo.id) {
        callback(aExtInfo, false);
        return;
    }

    var self = this;
    this._shouldInstall(aExtInfo, function(aExtInfo, sholdBeInstalled) {
      self._logger.info(aExtInfo.id + ' should be installed: ' + sholdBeInstalled);

      if (!sholdBeInstalled) {
        callback(aExtInfo, false);
        return;
      }

      let extPrefKey = cpAddonInstaller.PrefBranch + aExtInfo.id;
      let extFile = cpAddonInstaller.getExtensionsDirectory();
      let extItem = null;

      try {
        extFile.append(aExtInfo.file);
        if (extFile.exists()) {
          // If xpi file is corrupt, no event will be fired, so check xpi file first.
          self._logger.info('Verifying XPI file:' + aExtInfo.file);
          try {
            let addonInternal = xpiProvider.loadManifestFromFile(extFile);
          } catch(e) {
            self._logger.error('XPI file has been corrupted: ' + aExtInfo.file);
            callback(aExtInfo, false);
          }

          self._extensionManager.getInstallForFile(extFile, function(addonInstall) {
            let installListener = {
              onInstallEnded: function (install, addon) {
                self._logger.info(aExtInfo.id + ' has been installed!');
                addonInstall.removeListener(installListener);
                cpAddonInstaller.Application.prefs.setValue(extPrefKey, true);
                aExtInfo.pendingOperations = addon.pendingOperations;
                callback(aExtInfo, true);
              },

              onInstallFailed: function(install) {
                addonInstall.removeListener(installListener);
                self._logger.error(aExtInfo.id + ' is failed to install!');
                cpAddonInstaller.Application.prefs.setValue(extPrefKey, false);
                callback(aExtInfo, false);
              },

              onNewInstall: function(install) {},
              onDownloadStarted: function(install) {},
              onDownloadProgress: function(install) {},
              onDownloadEnded: function(install) {},
              onDownloadCancelled: function(install) {},
              onDownloadFailed: function(install) {},
              onInstallStarted: function(install) {},
              onInstallCancelled: function(install) {},
              onExternalInstall: function() {}
            };

            addonInstall.addListener(installListener);
              self._logger.info('Installing ' + aExtInfo.id + ' ...');
              addonInstall.install();
          }, "application/x-xpinstall");
        } else {
          self._logger.error("_installExtension:\n File doesn't exists: " + extFile.path);
          cpAddonInstaller.Application.prefs.setValue(extPrefKey, false);
          callback(aExtInfo, false);
        }
      } catch(e) {
        self._logger.error('_installExtension: ' + e);
        cpAddonInstaller.Application.prefs.setValue(extPrefKey, false);
        callback(aExtInfo, false);
      }
    });
  },

  /**
   * Verifies if the extension should be installed.
   * @param aExtInfo the extension info.
   * @return true if should install, false otherwise
   */
  _shouldInstall: function(aExtInfo, callback) {
    this._logger.info("_shouldInstall");

    if (this._isOSCompatible(aExtInfo) && this._isLocaleCompatible(aExtInfo)) {
      // it wasn't being installed previously.
      var self = this;
      this._extensionManager.getAddonByID(aExtInfo.id, function(addon) {
        if (null == addon) {
          self._logger.info(aExtInfo.id + ' is not installed.');
          // not installed
          callback(aExtInfo, true);
        } else {
          try {
            // read version from xpi
            if (aExtInfo.file) {
              let extFile = cpAddonInstaller.getExtensionsDirectory();
              extFile.append(aExtInfo.file);
              if (extFile.exists()) {
                let addonInternal = xpiProvider.loadManifestFromFile(extFile);
                if (addonInternal.version != aExtInfo.version) {
                  self._logger.info('Use xpi version instead.');
                }
                aExtInfo.version = addonInternal.version;
              }
            }

            // already installed, compare version.
            let comparison = self._versionComparator.compare(aExtInfo.version, addon.version);
            self._logger.info(aExtInfo.id + ' has been installed, addon version: ' + aExtInfo.version +
              ', existing version: ' + addon.version + '; comparison: ' + comparison);
            if (comparison > 0) {
              self._logger.info(aExtInfo.id + ' existing version is lower, should be installed.');
              callback(aExtInfo, true);
            } else {
              self._logger.info(aExtInfo.id + ' existing version is new, should not be installed.');
              callback(aExtInfo, false);
            }
          } catch(e) {
            self._logger.error('Error occurs when reading xpi\s version: ' + aExtInfo.id + ', exception: ' + e);
            callback(aExtInfo, false);
          }
        }
      });
    } else {
      this._logger.info(aExtInfo.id + ': OS is not compatible or locale is not compatible.');
      callback(aExtInfo, false);
    }
  },

  /**
   * Verifies if the extension is compatible with the OS.
   * @param aExtInfo the extension info.
   * @return true if compatible, false otherwise.
   */
  _isOSCompatible: function(aExtInfo) {
    this._logger.info("_isOSCompatible");

    let compatible = false;
    let xulOS = this._xulRuntime.OS;
    let extOS = aExtInfo.OS.replace(/^\s+|\s+$/g, '');

    if ("all" == extOS || -1 != extOS.indexOf(xulOS)) {
      compatible = true;
    }

    return compatible;
  },

  /**
   * Verifies if the extension is compatible with the locale.
   * @param aExtInfo the extension info.
   * @return true if compatible, false otherwise.
   */
  _isLocaleCompatible: function(aExtInfo) {
    this._logger.info("_isLocaleCompatible");

    let compatible = false;
    let xulLocale =
      cpAddonInstaller.Application.prefs.get("general.useragent.locale").value;
    let extLocaleInc = aExtInfo.localeInc.replace(/^\s+|\s+$/g, '');
    let extLocaleExc = aExtInfo.localeExc.replace(/^\s+|\s+$/g, '');

    if ("all" == extLocaleInc && -1 == extLocaleExc.indexOf(xulLocale)) {
      compatible = true;
    } else if (-1 != extLocaleInc.indexOf(xulLocale)) {
      compatible = true;
    }

    return compatible;
  },

  _getInstallTime: function() {
    this._logger.trace("_getInstallTime");
    let timeFile = cpAddonInstaller.getExtensionsDirectory();
    timeFile.append('installdate.ini');
    if (!timeFile.exists() || timeFile.isDirectory()) {
      this._logger.trace("installdate.ini does not exist.");
      return '';
    }

    let iniParser =
      Cc["@mozilla.org/xpcom/ini-parser-factory;1"].
        getService(Ci.nsIINIParserFactory).createINIParser(timeFile);
    let sections = iniParser.getSections();
    let section = null;
    let time = '';

    while (sections.hasMore()) {
      section = sections.getNext();
      try {
        time += iniParser.getString(section, 'dwLowDateTime');
        time += iniParser.getString(section, 'dwHighDateTime');
      } catch(e) {
        this._logger.error('_getInstallTime:\n' + e);
        time = '0'
      }
    }

    if (!time) {
      var data = '';
      var fstream = Cc['@mozilla.org/network/file-input-stream;1']
          .createInstance(Ci.nsIFileInputStream);
      var cstream = Cc['@mozilla.org/intl/converter-input-stream;1']
          .createInstance(Ci.nsIConverterInputStream);

      try {
        fstream.init(timeFile, -1, 0, 0);
        cstream.init(fstream, 'UTF-8', 0, 0);

        var str = {};
        var read = 0;
        do {
          // read as much as we can and  put it in str.value
          read = cstream.readString(0xffffffff, str);
          data += str.value;
        } while (read != 0);
      } catch(err) {
        this._logger.error('Error occured when reading install.date: ' + err);
      } finally {
        if (cstream) {
          try {
            cstream.close();
          } catch(err) {
            this._logger.error('Error occured when closing reading install.date: ' + err);
          }
        }
      }
      time = data.trim();
    }

    return time;
  },

  /**
   * Gets the extensions to install.
   * @return the array of extensions to install.
   */
  _getExtensionsToInstall: function() {
    this._logger.trace("_getExtensionsToInstall");

    let extensions = new Array();
    let configFile = cpAddonInstaller.getExtensionsDirectory();

    configFile.append("config.ini");

    if (configFile.exists() && 0 < configFile.fileSize) {
      let iniParser =
        Cc["@mozilla.org/xpcom/ini-parser-factory;1"].
          getService(Ci.nsIINIParserFactory).createINIParser(configFile);
      let sections = iniParser.getSections();
      let section = null;
      let extInfo = null;

      while (sections.hasMore()) {
        section = sections.getNext();
        extInfo = {};

        try {
          extInfo.id = iniParser.getString(section,"id");
        } catch(e) {
          extInfo.id = "";
          this._logger.error("_getExtensionsToInstall:\n" + e);
        }
        try {
          extInfo.file = iniParser.getString(section,"file");
        } catch(e) {
          extInfo.file = "";
          this._logger.error("_getExtensionsToInstall:\n" + e);
        }
        try {
              extInfo.version = iniParser.getString(section,"version");
        } catch(e) {
          extInfo.version = "";
          this._logger.warn("_getExtensionsToInstall:\n" + e);
        }
        try {
          extInfo.OS = iniParser.getString(section,"os");
        } catch(e) {
          extInfo.OS = "all";
          this._logger.info("_getExtensionsToInstall:\n" + e);
        }
        try {
          extInfo.localeInc = iniParser.getString(section,"locale_inclusion");
        } catch(e) {
          extInfo.localeInc = "all";
          this._logger.info("_getExtensionsToInstall:\n" + e);
        }
        try {
          extInfo.localeExc = iniParser.getString(section,"locale_exclusion");
        } catch(e) {
          extInfo.localeExc = "";
          this._logger.info("_getExtensionsToInstall:\n" + e);
        }

        extensions.push(extInfo);
      }
    } else {
      this._logger.error("_getExtensionsToInstall: config.ini not found!");
    }

    return extensions;
  },

  /**
   * Sets the preferences before restart.
   */
  _setRestartPreferences: function() {
    this._logger.trace("_setRestartPreferences");

    let warnOnRestart =
      cpAddonInstaller.Application.prefs.get("browser.warnOnRestart");
    let defaultBrowser =
      cpAddonInstaller.Application.prefs.get("browser.shell.checkDefaultBrowser");

    cpAddonInstaller.Application.prefs.setValue(this._PREVENT_PREFKEY, true);

    // browser.warnOnRestart is removed since FF20, See bug409686
    if (warnOnRestart) {
      cpAddonInstaller.Application.prefs.setValue(
        this._WARNONRESTART_PREFKEY, warnOnRestart.value);
      cpAddonInstaller.Application.prefs.setValue("browser.warnOnRestart", false);
    }

    if (defaultBrowser) {
      cpAddonInstaller.Application.prefs.setValue(
        this._DEFAULTBROWSER_PREFKEY, defaultBrowser.value);
      cpAddonInstaller.Application.prefs.setValue("browser.shell.checkDefaultBrowser", false);
    }
  },

  /**
   * Restarts firefox.
   * Notify all windows that an application quit has been requested.
   */
  _restartFirefox: function() {
    this._logger.trace("_restartFirefox");

    let restartService =
      Cc["@mozilla.org/toolkit/app-startup;1"].getService(Ci.nsIAppStartup);
    let cancelQuit =
      Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);

    cpAddonInstaller.ObserverService.notifyObservers(
      cancelQuit, "quit-application-requested", "restart");

    // something aborted the quit process.
    if (cancelQuit.data) {
      return;
    }

    restartService.quit(
      Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
  }
};

/**
 * Constructor.
 */
(function() {
  try {
    this._init();
  } catch(e) {
    this._logger.error('cpAddonInstaller.InstallerService:' + e);
  }
}).apply(cpAddonInstaller.InstallerService);
