(function() {
	var ns = MOA.ns('SafeFlag.Layout')

    function safeGetElementById(id) {
        var element = window.document.getElementById(id);
        if (!element)
            throw Error("Element does not exist: " + id);
        return element;
    }

    function deleteElementById(id) {
        var node = window.document.getElementById(id);
        if (!node)
            return;
        node.parentNode.removeChild(node);
        if (window.document.getElementById(id) != null)
            throw Error("Failed to delete element: " + id);
    }

    function wrapElementWith(node,type,id) {
        var wrapper = window.document.createElement(type);
        wrapper.setAttribute("id",id);
        wrapper.appendChild(node);
        return wrapper;
    }

    // Update the position of the flag icon based on current prefs
    function _updatePosition() {
        try {
            /**
             * Rather than detecting where the icon is and move it from there to its new location,
             * I move it into a temporary location and then delete both possible previous wrappers.
             * As a result, I can simply place the icon in the same generic way every time.
             */
            var iconBox = safeGetElementById("safeflag-iconbox");
            iconBox.hidden = true;
            safeGetElementById("main-window").appendChild(iconBox);
            if (!iconBox)
                throw Error("Lost safeflag-iconbox in main-window");

            // Cleanup any existing panels
            deleteElementById("safeflag-statusbarpanel");
            deleteElementById("safeflag-addressbarpanel");

			var icon = safeGetElementById("safeflag-icon");
            var bar, panel, nextSibling;
            var iconLoc = MOA.SafeFlag.Utils.getPrefs().getCharPref("safeflag.position.bar");   // What bar is it in?
            var iconPos = MOA.SafeFlag.Utils.getPrefs().getCharPref("safeflag.position.side");  // Where in that bar is it?

            switch (iconLoc) {
                case "statusbar":  // Positions reversed in right-to-left locales
                    bar = safeGetElementById("status-bar");
                    panel = wrapElementWith(iconBox, "statusbarpanel", "safeflag-statusbarpanel");
                    if (icon.getAttribute("chromedir") == "rtl")  // via global.dtd
                        iconPos = { LM:"RM", L:"R", R:"L", RM:"LM" }[iconPos];  // Need to flip positioning to match strings
                    switch (iconPos) {
                        case "LM":
                            nextSibling = bar.firstChild;
                            break;
                        case "L":
                            nextSibling = window.document.getElementById("statusbar-display");
                            if (!nextSibling)
                                nextSibling = bar.firstChild;
                            break;
                        case "R":
                            var popBlockBtn = window.document.getElementById("page-report-button");
                            if (!popBlockBtn)
                                popBlockBtn = window.document.getElementById("popupIcon");  // SeaMonkey 2 support (button has different ID)
                            nextSibling = popBlockBtn ? popBlockBtn.nextSibling : null ;
                            break;
                        case "RM":
                            nextSibling = null;
                            break;
                    }
                    break;

                case "addressbar":  // Positions _NOT_ reversed in right-to-left locales
                    bar = safeGetElementById("urlbar-icons");
                    panel = wrapElementWith(iconBox,"box","safeflag-addressbarpanel");
                    switch (iconPos) {
                        case "LM":
                        case "L":       			// REQUIRES FF3+
                            nextSibling = bar;      // Will place icon to left of address field
                            bar = bar.parentNode;   // Jump out of normal icon box
                            panel.style.marginLeft = "4px";
                            break;
                        case "R":
                            nextSibling = window.document.getElementById("star-button");  // If not FF3+ this'll be null => "RM"
                            if (nextSibling && nextSibling.parentNode.id != bar.id)
                                nextSibling = null;  // Flock 2 support ("star-button" is not in "urlbar-icons")
                            break;
                        case "RM":
                            nextSibling = null;
                            break;
                    }
                    break;
            }
            if (nextSibling === undefined) {
                throw Error("Invalid position: " + iconLoc + "-" + iconPos);
			}

            // Make the placement
            try {
				bar.insertBefore(panel,nextSibling);
            } catch(e) {
				bar.appendChild(panel);
			}
			iconBox.hidden = false;
        } catch (e) {
            // This window probably just lacks an address bar or status bar; safeflag can't work in this window
            if (e.message.substr(0, 22) == "Element does not exist" && url == "init")
                MOA.SafeFlag.Utils.error("safeflag warning: attempted to load icon into an unsupported window");
            else
            	MOA.SafeFlag.Utils.error("Error setting icon position.", e);

            throw null;  // Done error reporting; abort loading if needed
        }
    }

	function _getIconPath(filename) {
	    return "chrome://cmsafeflag/content/icons/" + filename + ".png";
	}

	function _isActivated() {
		var uri = MOA.SafeFlag.Utils.getCurrentURI();
	    try {
		    if (!uri || !uri.host)
		    	return false;
	    } catch (e) {
	    	return false;
	    }

	    return true;
	}

    // remenber default background style for urlbar which is white under windows and linux but is empty under mac
    var default_background = null;
    function _updateIcon() {
        var urlbar = document.getElementById('urlbar');
        if (null == default_background) {
        	default_background = urlbar.style.backgroundColor;
        }
        urlbar.style.backgroundColor = default_background;
        var icon = document.getElementById("safeflag-icon");
        icon.src = _getIconPath('special/default');
	    icon.tooltipText = 'Safe Flag';

	    if (!_isActivated())
	    	return;

	    var current_tab_safeflag = MOA.SafeFlag.Monitor.getCurrentTabSafeflag();
	    if (!current_tab_safeflag)
	    	return;

	    icon.tooltipText = '';
        var isSafeBackground = MOA.SafeFlag.Utils.getPrefs().getBoolPref("safeflag.background.safe");
        var isUnsafeBackground = MOA.SafeFlag.Utils.getPrefs().getBoolPref("safeflag.background.unsafe");

        if (current_tab_safeflag.isMalware || current_tab_safeflag.isPhishing) {
        	icon.src = _getIconPath('special/unsafe');
        	if(isUnsafeBackground) {
                MOA.debug('Set background color for unsafe sites.');
				urlbar.style.backgroundColor = "red";
        	}
        } else {
        	icon.src = _getIconPath('special/safe');
        	if(isSafeBackground) {
                MOA.debug('Set background color for safe sites.');
        	    urlbar.style.backgroundColor = "#CCFF99";
        	}
        }
    }

    ns.updateIcon = function() {
    	_updateIcon();
    };

    function _onPrefChange(branch, prefName) {
    	switch (prefName) {
    		case 'position.bar':
    		case 'position.side':
    			_updatePosition();
    			break;
    		case 'usealticons':
    			//
    			break;
    		case 'background.unsafe':
    		case 'background.safe':
    			_updateIcon();
    			break;
    	}
    }

    var _popup_timer_ = null;
    function _clearPopupTimer() {
    	window.clearTimeout(_popup_timer_);
    }

    function _onMouseOverIcon() {
    	_clearPopupTimer();

    	var uri = MOA.SafeFlag.Utils.getCurrentURI();
	    if (!_isActivated())
	    	return;

	    var current_tab_safeflag = MOA.SafeFlag.Monitor.getCurrentTabSafeflag();
	    if (!current_tab_safeflag)
	    	return;

	    _popup_timer_ = window.setTimeout(function() {
			var popup = safeGetElementById('safeflag-popup');
			if (current_tab_safeflag.isMalware || current_tab_safeflag.isPhishing){
				safeGetElementById('safeflag-popup-safe').hidden = true;
				safeGetElementById('safeflag-popup-risk').hidden = false;
				popup.className = 'safeflag-popup-risk';
			} else {
				safeGetElementById('safeflag-popup-safe').hidden = false;
				safeGetElementById('safeflag-popup-risk').hidden = true;
				popup.className = 'safeflag-popup-safe';
			}
		    popup.openPopup(safeGetElementById('safeflag-icon'), 'after_start', 0, 0, false, false);
	    }, 100);
    }

    function _onMouseOutIcon() {
    	_clearPopupTimer();
    	_popup_timer_ = window.setTimeout(function() {
	    	safeGetElementById('safeflag-popup').hidePopup();
    	}, 100);
    }

    function _onMouseOverPopup() {
    	_clearPopupTimer();
    }

    function _onMouseOutPopup() {
    	_clearPopupTimer();
    	_popup_timer_ = window.setTimeout(function() {
	    	safeGetElementById('safeflag-popup').hidePopup();
    	}, 100);
    }

    function _initIconEvent() {
    	var menu = safeGetElementById('safeflag-icon');
    	menu.addEventListener('mouseover', _onMouseOverIcon, false);
    	menu.addEventListener('mouseout', _onMouseOutIcon, false);
    	var popup = safeGetElementById('safeflag-popup');
    	popup.addEventListener('mouseover', _onMouseOverPopup, false);
    	popup.addEventListener('mouseout', _onMouseOutPopup, false);
    };

    MOA.SafeFlag.Utils.PrefListener('safeflag.', _onPrefChange);
	window.addEventListener('load', function(evt) {
		_updatePosition();
		_initIconEvent();
	}, false);
})();
