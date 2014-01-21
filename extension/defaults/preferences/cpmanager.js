pref("browser.tabs.autoHide", false);
pref("pfs.datasource.url", "https://services.mozilla.com.cn/pfs/plugins/PluginFinderService.php?mimetype=%PLUGIN_MIMETYPE%&appID=%APP_ID%&appVersion=%APP_VERSION%&clientOS=%CLIENT_OS%&chromeLocale=%CHROME_LOCALE%&appRelease=%APP_RELEASE%");
pref("startup.homepage_override_url", "http://firefox.com.cn/whatsnew/");
// Only works in Firefox3
pref("xpinstall.whitelist.add", "addons.mozilla.org,g-fox.cn,mozilla.com.cn,firefox.com.cn,mozilla.cn,personas.g-fox.cn");
// Define our own whitelist
// this list plus default whitelist should equals to "xpinstall.whitelist.add"
pref("extensions.cpmanager@mozillaonline.com.xpinstall.whitelist.add", "g-fox.cn,mozilla.com.cn,firefox.com.cn,mozilla.cn,personas.g-fox.cn");
pref("extensions.cpmanager@mozillaonline.com.xpinstall.importlist", true);

pref("extensions.cpmanager@mozillaonline.com.show_bookmark_toolbar", true);

pref("dom.ipc.plugins.enabled.npccbnetsigncom.dll", false);

//plugin checker for flash
pref("plugins.update.flash.WINNT.url","http://r.g-fox.cn/plugin/flash_WINNT");
pref("plugins.update.flash.Darwin.url","http://r.g-fox.cn/plugin/flash_Darwin");
//pref("plugins.update.flash.Linux.url","http://r.g-fox.cn/plugin/flash_Linux");

//data choices of tracking
pref("extensions.cpmanager.tracking.notification.show", true);
pref("extensions.cpmanager.tracking.enabled", true);
pref("extensions.cpmanager.tracking.infoURL","http://www.firefox.com.cn/about/participate/#user-privacy");
