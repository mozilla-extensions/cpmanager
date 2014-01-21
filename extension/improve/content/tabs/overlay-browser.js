Components.utils.import("resource://gre/modules/Services.jsm");


// View for the undo menu.
function log(e) {
  Services.console.logStringMessage(e);
}
function ceUndoCloseTabMenu(element) {
  this._root = element;   // <menu> or <toolbarbutton>
  this._popup = this._root.firstChild; // <menupopup>
  this._root._placesView = this;
  XPCOMUtils.defineLazyServiceGetter(this, "_ss",
                                     "@mozilla.org/browser/sessionstore;1",
                                     "nsISessionStore");
  this.toggleRecentlyClosedTabs();
  this._enableClearMenu = false;
}

ceUndoCloseTabMenu.prototype = {
  enableClearMenu: function UCTM_enableClearMenu() {
    this._enableClearMenu = true;
  },
  clearRecentlyClosedTabs: function UCTM_clearRecentlyClosedTabs() {
    var max = 10;
    try {
      max = Services.prefs.getIntPref("browser.sessionstore.max_tabs_undo");
      Services.prefs.setIntPref("browser.sessionstore.max_tabs_undo", 0);
      Services.prefs.setIntPref("browser.sessionstore.max_tabs_undo", max);
    } catch(ex) {
      max = 10;
      Services.prefs.setIntPref("browser.sessionstore.max_tabs_undo", max);
    }
    var evt = document.createEvent("Events");
    evt.initEvent("clearrecentlyclosedtabs", true, false);
    document.dispatchEvent(evt);
  },
  toggleRecentlyClosedTabs: function UCTM_toggleRecentlyClosedTabs() {
    // enable/disable the Recently Closed Tabs sub menu
    var undoMenu = this._root;

    // no restorable tabs, so disable menu
    if (this._ss.getClosedTabCount(window) == 0)
      undoMenu.setAttribute("disabled", true);
    else
      undoMenu.removeAttribute("disabled");
  },

  /**
    * Re-open a closed tab and put it to the end of the tab strip.
    * Used for a middle click.
    * @param aEvent
    *        The event when the user clicks the menu item
    */
  _undoCloseMiddleClick: function UCTM_undoCloseMiddleClick(aEvent) {
    if (aEvent.button != 1)
      return;

    undoCloseTab(aEvent.originalTarget.value);
    gBrowser.moveTabToEnd();
  },

  /**
   * Populate when the history menu is opened
   */
  populateUndoSubmenu: function UCTM_populateUndoSubmenu() {
    var undoMenu = this._root;
    var undoPopup = this._popup;

    // remove existing menu items
    while (undoPopup.hasChildNodes())
      undoPopup.removeChild(undoPopup.firstChild);

    // no restorable tabs, so make sure menu is disabled, and return
    if (this._ss.getClosedTabCount(window) == 0) {
      undoMenu.setAttribute("disabled", true);
      return;
    }

    // enable menu
    undoMenu.removeAttribute("disabled");

    // populate menu
    var undoItems = JSON.parse(this._ss.getClosedTabData(window));
    for (var i = 0; i < undoItems.length; i++) {
      var m = document.createElement("menuitem");
      m.setAttribute("label", undoItems[i].title);
      if (undoItems[i].image) {
        let iconURL = undoItems[i].image;
        // don't initiate a connection just to fetch a favicon (see bug 467828)
        if (/^https?:/.test(iconURL))
          iconURL = "moz-anno:favicon:" + iconURL;
        m.setAttribute("image", iconURL);
      }
      m.setAttribute("class", "menuitem-iconic bookmark-item menuitem-with-favicon");
      m.setAttribute("value", i);
      m.setAttribute("oncommand", "undoCloseTab(" + i + ");");

      // Set the targetURI attribute so it will be shown in tooltip and trigger
      // onLinkHovered. SessionStore uses one-based indexes, so we need to
      // normalize them.
      let tabData = undoItems[i].state;
      let activeIndex = (tabData.index || tabData.entries.length) - 1;
      if (activeIndex >= 0 && tabData.entries[activeIndex])
        m.setAttribute("targetURI", tabData.entries[activeIndex].url);

      m.addEventListener("click", this._undoCloseMiddleClick, false);
      if (i == 0)
        m.setAttribute("key", "key_undoCloseTab");
      undoPopup.appendChild(m);
    }

    // "Clear All Tabs"
    var bundles = Cc["@mozilla.org/intl/stringbundle;1"].
            getService(Ci.nsIStringBundleService).
            createBundle("chrome://cmimprove/locale/browser.properties");
    undoPopup.appendChild(document.createElement("menuseparator"));
    m = undoPopup.appendChild(document.createElement("menuitem"));
    m.id = "ce_menu_clearAllTabs";
    if (!this._enableClearMenu)
      m.setAttribute("disabled","true");
    m.setAttribute("label", bundles.GetStringFromName("ce.menuClearAllTabs.label"));
    var self = this;
    m.addEventListener("command", function() {self.clearRecentlyClosedTabs()}, false);

    // "Restore All Tabs"
    var strings = gNavigatorBundle;
    m = undoPopup.appendChild(document.createElement("menuitem"));
    m.id = "menu_restoreAllTabs";
    m.setAttribute("label", strings.getString("menuRestoreAllTabs.label"));
    m.addEventListener("command", function() {
      for (var i = 0; i < undoItems.length; i++)
        undoCloseTab();
    }, false);
  },
};
// tabs context menu
(function() {

function $(id) {
  if (typeof id == 'string') {
    return document.getElementById(id);
  } else {
    return id;
  }
}
// Modify element with optional properties
function $M(id, props, eventhandlers) {
  var el = $(id);
  if (props && el) {
    for (var key in props) {
      if (key == "value") {
        el.value = props[key];
      } else if (key == "class" && Services.appinfo.OS != "WINNT") {
        continue;
      } else {
        if (props[key]) {
          el.setAttribute(key, props[key]);
        } else {
          el.removeAttribute(key)
        }
      }
    }
  }
  if (eventhandlers) {
    for (var event in eventhandlers) {
      el.addEventListener(event, eventhandlers[event], false);
    }
  }
  return el;
}
// Create element with optional properties
function $E(tag, props, eventhandlers) {
  const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
  var el = document.createElementNS(XUL_NS, tag);
  return $M(el, props, eventhandlers)
}
var _bundles = Cc["@mozilla.org/intl/stringbundle;1"].
        getService(Ci.nsIStringBundleService).
        createBundle("chrome://cmimprove/locale/browser.properties");
function getString(key) {
  return _bundles.GetStringFromName(key);
}
function cmd_cloneTab() {
  tab = TabContextMenu.contextTab;
  if (!tab) {
    return;
  }
  openUILinkIn(tab.linkedBrowser.currentURI.spec, "tab");
}
function cmd_closeRight() {
  tab = TabContextMenu.contextTab;
  if (!tab) {
    return;
  }
  var right = tab.nextElementSibling;
  while (right) {
    tab = right;
    right = tab.nextElementSibling;
    if (tab.tagName == "tab") {
      gBrowser.removeTab(tab);
    }
  }
}
function cmd_bookmark() {
  tab = TabContextMenu.contextTab;
  if (!tab) {
    return;
  }
  var tfID = Services.prefs.getIntPref("extensions.cmimprove.bookmarks.parentFolder");
  if (tfID == -1) {
    tfID = Services.prefs.getIntPref("extensions.cmimprove.bookmarks.add.defaultFolder");
  }
  PlacesCommandHook.bookmarkPage(tab.linkedBrowser, tfID, true);
}
function cmd_reloadSkipCache() {
  tab = TabContextMenu.contextTab;
  if (!tab) {
    return;
  }
  const reloadFlags = Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY | Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE;
  tab.linkedBrowser.reloadWithFlags(reloadFlags);
}
var undoclose = {
  handleEvent: function UC_handleEvent(aEvent) {
    switch (aEvent.type) {
      case "load":
        this.init();
        break;
      case "unload":
        this.uninit();
        break;
      case "TabClose":
        this.animate(aEvent.originalTarget);
        this.enableClearMenu();
      case "TabOpen":
      case "aftercustomization":
      case "clearrecentlyclosedtabs":
        this.toggleRecentlyClosedTabs();
        break;
    }
  },
  enableClearMenu: function UC_enableClearMenu() {
    var button = $("ce-undo-close-toolbar-button");
    if (button) {
      if (!button._placesView)
        new ceUndoCloseTabMenu(button);
      button._placesView.enableClearMenu();
    }
    var menu = $("ce-undo-close-tab-contextmenu");
    if (menu) {
      if (!menu._placesView)
        new ceUndoCloseTabMenu(menu);
      menu._placesView.enableClearMenu();
    }
  },
  installButton: function() {
    try {
      if (Application.prefs.getValue("extensions.cmimprove.undoclose.installButton", false))
        return;
      var navbar = document.getElementById("nav-bar");
      var str = navbar.currentSet + "";
      if (str.indexOf("ce-undo-close-toolbar-button") != -1)
        return;
      str = str + ",ce-undo-close-toolbar-button";
      navbar.setAttribute("currentset", str);
      navbar.currentSet = str;
      document.persist("nav-bar", "currentset");
      BrowserToolboxCustomizeDone(true);
      Application.prefs.setValue("extensions.cmimprove.undoclose.installButton", true);
    } catch(e) {}
  },

  init: function UC_init() {
    gBrowser.tabContainer.addEventListener("TabOpen", this, false);
    gBrowser.tabContainer.addEventListener("TabClose", this, false);
    var toolbox = $("navigator-toolbox");
    toolbox.addEventListener("aftercustomization", this, false)
    this.installButton();
    setTimeout(this.toggleRecentlyClosedTabs, 200);
  },
  uninit: function UC_uninit() {
    gBrowser.tabContainer.removeEventListener("TabClose", this, false);
    gBrowser.tabContainer.removeEventListener("TabOpen", this, false);
    var toolbox = $("navigator-toolbox");
    toolbox.removeEventListener("aftercustomization", this, false)
  },
  toggleRecentlyClosedTabs: function UC_toggleRecentlyClosedTabs() {
    var button = $("ce-undo-close-toolbar-button");
    if (button) {
      if (!button._placesView)
        new ceUndoCloseTabMenu(button);
      button._placesView.toggleRecentlyClosedTabs();
    }
    var menu = $("ce-undo-close-tab-contextmenu");
    if (menu) {
      if (!menu._placesView)
        new ceUndoCloseTabMenu(menu);
      menu._placesView.toggleRecentlyClosedTabs();
    }
  },
  iQ: function UC_iQ(elem) {
    return {
      elem: elem,
      // ----------
      // Function: css
      // Sets or gets CSS properties on the receiver. When setting certain numerical properties,
      // will automatically add "px". A property can be removed by setting it to null.
      //
      // Possible call patterns:
      //   a: object, b: undefined - sets with properties from a
      //   a: string, b: undefined - gets property specified by a
      //   a: string, b: string/number - sets property specified by a to b
      css: function animation_content_css(a, b) {
        let properties = null;

        if (typeof a === 'string') {
          let key = a;
          if (b === undefined) {
            return window.getComputedStyle(this.elem, null).getPropertyValue(key);
          }
          properties = {};
          properties[key] = b;
        } else if (a instanceof Rect) {
          properties = {
            left: a.left,
            top: a.top,
            width: a.width,
            height: a.height
          };
        } else {
          properties = a;
        }

        let pixels = {
          'left': true,
          'top': true,
          'right': true,
          'bottom': true,
          'width': true,
          'height': true
        };

        for (let key in properties) {
          let value = properties[key];

          if (pixels[key] && typeof value != 'string')
            value += 'px';

          if (value == null) {
            this.elem.style.removeProperty(key);
          } else if (key.indexOf('-') != -1)
            this.elem.style.setProperty(key, value, '');
          else
            this.elem.style[key] = value;
        }
        return this;
      },

      // ----------
      // Function: animate
      // Uses CSS transitions to animate the element.
      //
      // Parameters:
      //   css - an object map of the CSS properties to change
      //   options - an object with various properites (see below)
      //
      // Possible "options" properties:
      //   duration - how long to animate, in milliseconds
      //   easing - easing function to use. Possibilities include
      //     "tabviewBounce", "easeInQuad". Default is "ease".
      //   complete - function to call once the animation is done, takes nothing
      //     in, but "this" is set to the element that was animated.
      animate: function animation_content_animate(css, options) {
        if (!options)
          options = {};

        let easings = {
          tabviewBounce: "cubic-bezier(0.0, 0.63, .6, 1.29)",
          easeInQuad: 'ease-in', // TODO: make it a real easeInQuad, or decide we don't care
          fast: 'cubic-bezier(0.7,0,1,1)'
        };

        let duration = (options.duration || 400);
        let easing = (easings[options.easing] || 'ease');

        if (css instanceof Rect) {
          css = {
            left: css.left,
            top: css.top,
            width: css.width,
            height: css.height
          };
        }

        // The latest versions of Firefox do not animate from a non-explicitly
        // set css properties. So for each element to be animated, go through
        // and explicitly define 'em.
        let rupper = /([A-Z])/g;
        let cStyle = window.getComputedStyle(this.elem, null);
        for (let prop in css) {
          prop = prop.replace(rupper, "-$1").toLowerCase();
          this.css(prop, cStyle.getPropertyValue(prop));
        }

        this.css({
          '-moz-transition-property': Object.keys(css).join(", "),
          '-moz-transition-duration': (duration / 1000) + 's',
          '-moz-transition-timing-function': easing
        });

        this.css(css);
        let self = this;
        setTimeout(function() {
          self.css({
            '-moz-transition-property': 'none',
            '-moz-transition-duration': '',
            '-moz-transition-timing-function': ''
          });

          if (typeof options.complete == "function")
            options.complete.apply(self);
        }, duration);

        return this;
      },

      // ----------
      // Function: fadeOut
      // Animates the receiver to full transparency. Calls callback on completion.
      fadeOut: function animation_content_fadeOut(callback) {
        let self = this;
        this.animate({
          opacity: 0
        }, {
          duration: 400,
          complete: function() {
            self.css({display: 'none'});
            if (typeof callback == "function")
              callback.apply(self);
          }
        });

        return this;
      },

      // ----------
      // Function: fadeIn
      // Animates the receiver to full opacity.
      fadeIn: function animation_content_fadeIn() {
        this.css({display: ''});
        this.animate({
          opacity: 1
        }, {
          duration: 400
        });

        return this;
      },

      // ----------
      // Function: hide
      // Hides the receiver.
      hide: function animation_content_hide() {
        this.css({display: 'none', opacity: 0});
        return this;
      },

      // ----------
      // Function: show
      // Shows the receiver.
      show: function animation_content_show() {
        this.css({display: '', opacity: 1});
        return this;
      },
    };
  },
  animateCount: 0,
  animate: function UC_animate(aTab) {
    try {
      if (!Services.prefs.getBoolPref("extensions.cmimprove.features.undocloseanimation.enable", true)) {
        return;
      }
    } catch(e) {}
    var button = $("ce-undo-close-toolbar-button");
    if (!button)
      return;
    if (aTab != window.gBrowser.selectedTab)
      return;
    var panel = $("browser-panel");

    var linkedBrowser = window.gBrowser.selectedTab.linkedBrowser
    var top1 = linkedBrowser.boxObject.screenY - panel.boxObject.screenY + panel.boxObject.y;
    var left1 = linkedBrowser.boxObject.screenX - panel.boxObject.screenX + panel.boxObject.x;
    var width1 = linkedBrowser.boxObject.width;
    var height1 = linkedBrowser.boxObject.height;

    var top2 = button.boxObject.screenY - panel.boxObject.screenY + panel.boxObject.y + button.boxObject.height/2;
    var left2 = button.boxObject.screenX - panel.boxObject.screenX + panel.boxObject.x + button.boxObject.width/2;
    var width2 = 0;
    var height2 = 0;

    if (left2 == 0) //no animation when close about:addons
      return;
    if (this.animateCount++ > 0)
      return;
    var win = linkedBrowser.contentWindow.content;
    var canvas = $("ce-animation-canvas");
    canvas.width = width1;
    canvas.height = height1;
    let ctx = canvas.getContext("2d");
    ctx.drawWindow(win, win.scrollX, win.scrollY, width1, height1, "rgba(255,255,255,0.5)");
    var ac = this.iQ(canvas);

    ac.show();
    ac.css({
      top: top1,
      left: left1,
      width:  width1,
      height: height1,
      opacity: 0.5
    });
    ac.animate({
      top: top2,
      left: left2,
      width:  width2,
      height: height2,
    }, {
      duration: 900,
      complete: function undo_close_animate_complete() {
        ac.hide();
      }
    });
  },
};
var tcm = {
  init: function() {
    try {
      if (!Services.prefs.getBoolPref("extensions.cmimprove.features.tabcontextmenu.enable", true)) {
        return;
      }
    } catch(e) {}
    var parent = $("tabContextMenu")
    if (!parent) {
      return;
    }
    //remove all menuseparator
    var arr = parent.getElementsByTagName("menuseparator");
    try {
      for (var i = arr.length; i > 0;) {
        parent.removeChild(arr[--i]);
      }
    } catch(e) {}
    // Add new menu
    var btn_new = $E("menuitem", {
                      id: "ce_context_newTab" ,
                      label: getString("cp.tabs.new") ,
                      accesskey: "N" ,
                      key: "key_newNavigatorTab" ,
                      command: "cmd_newNavigatorTab",
                      style:"list-style-image: url('chrome://cmimprove/skin/tabs/menuicon.png');-moz-image-region: rect(0px, 16px, 16px, 0px);",
                      class:"menuitem-iconic",
                    });
    var btn_clone = $E("menuitem",{
                      id: "ce_context_cloneTab" ,
                      label: getString("cp.tabs.clone") ,
                    },{command: cmd_cloneTab});
    var btn_closeRight = $("context_closeTabsToTheEnd") || $E("menuitem",{
                      id: "ce_context_closeRight" ,
                      label: getString("cp.tabs.close.right"),
                    },{command: cmd_closeRight});
    var btn_bookmark = $E("menuitem",{
                      id: "ce_context_bookmark" ,
                      label: getString("cp.tabs.bookmark") ,
                      key: "addBookmarkAsKb" ,
                      style:"list-style-image: url('chrome://cmimprove/skin/tabs/menuicon.png');-moz-image-region: rect(0px, 80px, 16px, 64px);",
                      class:"menuitem-iconic",
                    },{command: cmd_bookmark});
    //show all
    var arr = [btn_new//[new]
              ,btn_clone//[clone]
              ,$E("menuseparator")  //--------------------
              ,$M("context_pinTab",{
                      style:"list-style-image: url('chrome://cmimprove/skin/tabs/menuicon.png');-moz-image-region: rect(0px, 32px, 16px, 16px);",
                      class:"menuitem-iconic"})//pin
              ,$M("context_unpinTab",{
                      style:"list-style-image: url('chrome://cmimprove/skin/tabs/menuicon.png');-moz-image-region: rect(0px, 48px, 16px, 32px);",
                      class:"menuitem-iconic"})//unpin
              ,$("context_tabViewMenu")//moveTo
              ,$("context_openTabInWindow")//moveWin
              ,$E("menuseparator")  //--------------------
              ,$M("context_closeTab",{
                      style:"list-style-image: url('chrome://cmimprove/skin/tabs/menuicon.png');-moz-image-region: rect(0px, 64px, 16px, 48px);",
                      class:"menuitem-iconic",
                      key:"key_close" })//close
              ,$("context_closeOtherTabs")//closeOtherTabs
              ,btn_closeRight//[closeRight]
              ,$M("context_undoCloseTab",{ key:"key_undoCloseTab" })//undoClose
              ,$("ce-undo-close-tab-contextmenu")
              ,$E("menuseparator")  //--------------------
              ,btn_bookmark//[bookmark]
              ,$M("context_bookmarkAllTabs",{ label: getString("cp.tabs.bookmark.all") })//bookmarkAll
              ,$M("context_reloadTab",{
                      oncommand:null,
                      style:"list-style-image: url('chrome://cmimprove/skin/tabs/menuicon.png');-moz-image-region: rect(0px, 96px, 16px, 80px);",
                      class:"menuitem-iconic" }
                   ,{ command:cmd_reloadSkipCache })//reload
              ,$("context_reloadAllTabs")//reloadAll
    ]
    var anchor = $E("menuseparator", { hidden: "true" });
    parent.insertBefore(anchor, parent.firstChild);
    arr.forEach(function(m) {
      if (m) {
        parent.insertBefore(m, anchor);
      }
    });
    //hide all menuseparator after anchor
    while (anchor.nextElementSibling) {
      anchor = anchor.nextElementSibling;
      if (anchor.tagName == "menuseparator") {
        anchor.setAttribute("hidden", "true")
      }
    }

    var _updateContextMenuOrig = TabContextMenu.updateContextMenu.bind(TabContextMenu);
    TabContextMenu.updateContextMenu = (function(aPopupMenu) {
      _updateContextMenuOrig(aPopupMenu);
      $('ce_context_closeRight').hidden = this.contextTab.pinned;
      $('ce_context_closeRight').disabled = !this.contextTab.nextElementSibling;
      $('ce_context_bookmark').hidden = this.contextTab !== gBrowser.selectedTab;
      if (this.contextTab.pinned) {
        $('context_closeTab').removeAttribute('key');
      } else {
        $('context_closeTab').setAttribute('key', 'key_close');
      }
    }).bind(TabContextMenu);
  },
}

window.addEventListener('load', tcm.init, false);
window.addEventListener('load', undoclose, false);
window.addEventListener('unload', undoclose, false);
document.addEventListener('clearrecentlyclosedtabs', undoclose, false);
})();
