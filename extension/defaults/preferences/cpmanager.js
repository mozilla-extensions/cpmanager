pref("browser.tabs.autoHide", false);
// Only works in Firefox3
pref("xpinstall.whitelist.add", "addons.mozilla.org,g-fox.cn,mozilla.com.cn,firefox.com.cn,mozilla.cn,personas.g-fox.cn");
// Define our own whitelist
// this list plus default whitelist should equals to "xpinstall.whitelist.add" 
pref("extensions.cpmanager@mozillaonline.com.xpinstall.whitelist.add", "g-fox.cn,mozilla.com.cn,firefox.com.cn,mozilla.cn,personas.g-fox.cn");
pref("extensions.cpmanager@mozillaonline.com.xpinstall.importlist", true);