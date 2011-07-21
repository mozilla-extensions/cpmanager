(function() {
	var ns = MOA.ns('Notification');

	/**
	 * One tab can only attach one notification at the same time.
	 * One notification can be attached to sevral tabs.
	 * tabNotiQueue = {
	 * 	tab1_id: reminder1_id,
	 *  tab2_id: reminder1_id
	 * 	...
	 * };
	 *
	 * Same notification should be removed simultaneously.
	 *
	 * notiTabQueue = {
	 * 	reminder1_id: [tab1_id, tab2_id]
	 *  ...
	 * }
	 */
	var tabNotiQueue = {};
	var notiTabQueue = {};

	// The id of balloon reminder is showing.
	var showingBalloonId = null;

	function _removeNotiFromQueue(rid) {
		if (!rid || !notiTabQueue[rid])
			return;

		var tabids = notiTabQueue[rid];
		for (var i = 0, len = tabids.length; i < len; i++) {
			delete tabNotiQueue[tabids[i]]
		}
		delete notiTabQueue[rid];
	}

	function _removeNotification(rid) {
		if (!rid || !notiTabQueue[rid])
			return;

		_removeNotiFromQueue(rid);
		// Already been shown, so do not show it again.
		// Remove the reminder from RuleCenter
		MOA.RuleCenter.removeReminder(rid);
	}

	function _closeBalloon() {
		_removeNotification(showingBalloonId);
		showingBalloonId = null;
	};

	var showingNotifications = {};
	function _closeInstallNoti(tabId) {
		var notification = tabNotiQueue[tabId];
		if (!notification)
			return;

		var rid = notification.reminder_id;
		_removeNotification(rid);
		delete showingNotifications[rid];
	};

	var installAddon = function(tabId) {
		MOA.debug('Install right now: ' + this);

		var notification = tabNotiQueue[tabId];
		if (!!notification) {
			var reminder = MOA.RuleCenter.getReminderById(notification.reminder_id);
			if (!!reminder) {
				var param = {};
				param[reminder.addon_name] = {
					URL: reminder.xpi_url
				};
				InstallTrigger.install(param, function(){
					_closeInstallNoti(tabId);
					MOA.RuleCenter.clickOnInstall(notification.reminder_id);
				});
				return;
			}
			MOA.RuleCenter.clickOnInstall(notification.reminder_id);
		} else {
			_closeInstallNoti(tabId);
		}
	};

	function reminderMeLater(tabId) {
		var notification = tabNotiQueue[tabId];
		if (!!notification) {
			MOA.RuleCenter.clickOnLater(notification.reminder_id);
		}
		_closeInstallNoti(tabId);
	};

	function noMoreReminder(tabId) {
		var notification = tabNotiQueue[tabId];
		if (!!notification) {
			MOA.RuleCenter.clickOnNoMore(notification.reminder_id);
		}
		_closeInstallNoti(tabId);
	};

	function _bindFunc(func, context) {
		var __method = func, args = Array.prototype.slice.call(arguments, 2);
		return function() {
			return __method.apply(context, args);
		}
	};

	function _getTargetPosition(target) {
		var x = target.boxObject.screenX;
		var y = target.boxObject.screenY;
		var h = screen.height;
		var w = screen.width;

		// 10px: arrow offset
		var ratio = target.boxObject.width / target.boxObject.height;
		var offset_x = target.boxObject.width / 2;
		if (offset_x <= 10) {
			offset_x = 0;
		} else if (ratio >= 2 && offset_x >= 30) {
			offset_x = 10;
		} else {
			offset_x -= 10;
		}

		// 14px: popup offset
		if (x < w - 300 && y < h - 300) {
			return ['after', 'start', 14 + offset_x, 0];
		}  else if (x >= w - 300 && y < h - 300) {
			return ['after', 'end', -2 - offset_x, 0];
		} else if (x < w - 300 && y > h - 300) {
			return ['before', 'start', 14 + offset_x, 0];
		}else {
			return ['before', 'end', -2 - offset_x, 0];
		}
	}

	var _popupinterval = null;
	var _opacity = 0;
	function _fadeIn() {
		window.clearTimeout(_popupinterval);

		var popup = MOA.Lib.get('balloon-tips');
		_opacity = popup.style.opacity = 0;
		popup.hidden = false;

		function _setopacity() {
			if (_opacity >= 1) {
				return;
			}
			_opacity += 0.2;
			popup.style.opacity = _opacity;

			_popupinterval = window.setTimeout(_setopacity, 100);
		}
		_setopacity();
	}

	function _fadeOut(callback) {
		var popup = MOA.Lib.get('balloon-tips');

		window.clearTimeout(_popupinterval);
		function _setopacity() {
			if (_opacity <= 0) {
				// popup.hidden = true;
				// In MacOS, if only set true to popup.hidden, the popup panel is not hidden actually.
				// The elements under panel will not be accessible.
				popup.hidePopup();
				_opacity = 0;
				if (callback && typeof callback == 'function') {
					callback();
				}
				return;
			}

			_opacity -= 0.2;
			popup.style.opacity = _opacity;
			_popupinterval = window.setTimeout(_setopacity, 50);
		}
		_setopacity();
	}

	var AUTO_HIDE_TIME = 1000 * 15;
	var _close_balloon_timeout = null;
	function _closePopup(callback) {
		window.clearTimeout(_close_balloon_timeout);
		_fadeOut(function() {
			_closeBalloon();
			if (typeof callback == 'function') {
				callback();
			}
		});
	};

	var showPopup = function() {
		_fadeIn();
	};

	/**
	 * Add notification, called by RuleCenter.
	 */
	ns.addNotification = function(rid, info) {
		if (!!tabNotiQueue[info.tabId])
			return;

		tabNotiQueue[info.tabId] = {
			reminder_id: rid,
			info: info
		};

		if (!notiTabQueue[rid])
			notiTabQueue[rid] = [];
		notiTabQueue[rid].push(info.tabId);
	};

	function _track_addon_noti(action, tabId) {
		var notification = tabNotiQueue[tabId];
		if (!notification)
			return;

		var reminder = MOA.RuleCenter.getReminderById(notification.reminder_id);
		if (!reminder)
			return;

		MOA.Tracker.track({
			type: 'addon',
			rid: notification.reminder_id,
			action: action ? action : 'show'
		});
	};

	function _track_func_noti(action, rid) {
		MOA.Tracker.track({
			type: 'func',
			rid: rid,
			action: action ? action : 'show'
		});
	};

	/**
	 * Show installation notification triggered by window url.
	 */
	function _show_install_notification(tabId) {
		var notification = tabNotiQueue[tabId];
		var reminder = MOA.RuleCenter.getReminderById(notification.reminder_id);

		if (showingNotifications[notification.reminder_id])
			return;
		else
			showingNotifications[notification.reminder_id] = 1;

		var buttons = [{
			label: '马上安装',
			accessKey: 'O',
			popup: null,
			callback: _bindFunc(function() {
				_track_addon_noti('install', this);
				installAddon(this);
			}, tabId)
		}, {
			label: '不再提醒',
			accessKey: 'N',
			popup: null,
			callback: _bindFunc(function() {
				_track_addon_noti('nomore', this);
				noMoreReminder(this);
			}, tabId)
		}, {
			label: '以后再说',
			accessKey: 'M',
			popup: null,
			callback: _bindFunc(function() {
				_track_addon_noti('later', this);
				reminderMeLater(this);
			}, tabId)
		}];

		var notificationBox = gBrowser.getNotificationBox();
		var priority = notificationBox.PRIORITY_INFO_MEDIUM;
		var newBar = notificationBox.appendNotification(reminder.desc, notification.reminder_id,
			'chrome://cpmanager/content/logo32x32_cn.png',
			priority, buttons);

		newBar.persistence += 5;

		newBar.addEventListener('DOMNodeRemoved', _bindFunc(function() {
			MOA.debug('Close popup.');
			_closeInstallNoti(this);
		}, tabId), true);
	};

	function _show_tips_content(container_id) {
		var boxes = MOA.Lib.get('balloon-tips-container').childNodes;
		for (var i = 0, len = boxes.length; i < len; i++) {
			boxes[i].hidden = boxes[i].id != container_id;
		}
	}

	/**
	 * Show function notification triggered by window url.
	 */
	function _show_function_notification(option) {
		var reminder_id = option.reminder_id;
		var reminder = option.reminder;
		var type = option.type;

		if (!!showingBalloonId)
			return;

		var target = MOA.Lib.get(reminder.btn_id);
		if (!target)
			return;

		_show_tips_content('balloon-tips-window');

		var p = MOA.Lib.get('balloon-tips-content');

		showPopup();
		var tips = MOA.Lib.get('balloon-tips');
		var position = _getTargetPosition(target); //['after', 'end'];
		tips.className = 'balloon-' + position[0] + '-' + position[1];
		tips.openPopup(target, position[0] + '_' + position[1], position[2], position[3], false, false);

		// set description.
		var txt = reminder.desc;

		while (p.firstChild) {
			p.removeChild(p.firstChild);
		}

		// Safely convert HTML string to a simple DOM object, striping it of javascript and more complex tags
		var injectHTML = Components.classes['@mozilla.org/feed-unescapehtml;1']
			.getService(Components.interfaces.nsIScriptableUnescapeHTML)
			.parseFragment(txt, false, null, p);

		p.appendChild(injectHTML);

		// Can not get html anchor elements by calling p.getElementsByTagName('a') and p.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'a').
		// So find them recursively.
		hook_anchor(p);
		showingBalloonId = reminder_id;

		_close_balloon_timeout = window.setTimeout(function() {
			ns.closeBalloonAndRemindLater();
		}, AUTO_HIDE_TIME);
	}

	/**
	 * Show notification related with current tabBrowser.
	 * Called by WebProgessListener.
	 */
	ns.showNotification = function(webProgress) {
		// Get current tab browser ID.
		var win = webProgress.DOMWindow;
		var tabId = MOA.Lib.getTabIdForWindow(win);
		if (!tabNotiQueue[tabId])
			return;

		var notification = tabNotiQueue[tabId];
		var reminder = MOA.RuleCenter.getReminderById(notification.reminder_id);

		if (reminder.type == 'addon') {
			_show_install_notification(tabId);
		} else if (reminder.type == 'function') {
			_show_function_notification({
				reminder: reminder,
				reminder_id: notification.reminder_id,
				tabId: tabId
			});
		}
	};

	function hook_anchor(p) {
		for (var i = 0, len = p.childNodes.length; i < len; i++) {
			var node = p.childNodes[i];
			if (node.tagName && node.tagName == 'a') {
				if (node.href.indexOf('http://') != 0 && node.href.indexOf('https://') != 0) {
					node.href = '#';
				} else {
					node.onclick = function() {
						gBrowser.selectedTab = window.openUILinkIn(this.href, 'tab');;
						return false;
					};
				}
			}
			hook_anchor(node);
		}
	}

	ns.onTabClose = function(tabId) {
		var notification = tabNotiQueue[tabId];
		if (!notification)
			return;

		_removeNotiFromQueue(notification.reminder_id);
	};

	ns.onClickCloseBalloon = function() {
		_track_func_noti('close', showingBalloonId);
		MOA.RuleCenter.clickOnLater(showingBalloonId);
		_closePopup();
	};

	ns.onClickNomoreBalloon = function() {
		_track_func_noti('nomore', showingBalloonId);
		MOA.RuleCenter.clickOnNoMore(showingBalloonId);
		_closePopup();
	};

	ns.onClickRemindLater = function() {
		_track_func_noti('later', showingBalloonId);
		MOA.RuleCenter.clickOnLater(showingBalloonId);
		_closePopup();
	};

	ns.onMouseOverBalloon = function() {
		window.clearTimeout(_close_balloon_timeout);
	};

	ns.onMouseOutBalloon = function() {
		window.clearTimeout(_close_balloon_timeout);
		_close_balloon_timeout = window.setTimeout(function() {
			ns.closeBalloonAndRemindLater();
		}, AUTO_HIDE_TIME);
	};

	ns.clearAll = function() {
		tabNotiQueue = {};
		notiTabQueue = {};
		showingBalloonId = null;
		showingNotifications = {};
	};

	/******One tip one day*******/
	var _daytipreminders = null;
	var _current_day_tip_reminder = null;
	var _hide_daytip_countdown = new MOA.Lib.CountDown({
		start: AUTO_HIDE_TIME / 1000,
		onFinish: function() {
			_track_daytip('auto_hide');
			_closeDayTip();
		},
	});

	function _closeDayTip() {
		_closePopup(function() {
			// when click finish, _start_counting_down will be triggered by onMouseOutTip.
			// so clear timeout again.
			_hide_daytip_countdown.reset();
		});
	};

	function _track_daytip(action) {
		MOA.Tracker.track({
			type: 'daytip',
			rid: MOA.RuleCenter.getRID(_current_day_tip_reminder),
			action: action ? action : 'show'
		});
	};

	function _show_day_tips(reminder) {
		var reminder_id = MOA.RuleCenter.getRID(reminder);

		var target = MOA.Lib.get(reminder.btn_id);
		if (!target)
			return;

		if (_daytipreminders.length == 0) {
			MOA.Lib.get('balloon-day-tip-next-btn').hidden = true;
		} else {
			MOA.Lib.get('balloon-day-tip-next-btn').hidden = false;
		}

		_show_tips_content('balloon-tips-day');

		var p = MOA.Lib.get('balloon-tips-day-content');

		showPopup();
		var tips = MOA.Lib.get('balloon-tips');
		var position = _getTargetPosition(target); //['after', 'end'];
		tips.className = 'balloon-' + position[0] + '-' + position[1];
		tips.openPopup(target, position[0] + '_' + position[1], position[2], position[3], false, false);

		// set description.
		var txt = reminder.desc;

		while (p.firstChild) {
			p.removeChild(p.firstChild);
		}

		// Safely convert HTML string to a simple DOM object, striping it of javascript and more complex tags
		var injectHTML = Components.classes['@mozilla.org/feed-unescapehtml;1']
			.getService(Components.interfaces.nsIScriptableUnescapeHTML)
			.parseFragment(txt, false, null, p);

		p.appendChild(injectHTML);

		// Can not get html anchor elements by calling p.getElementsByTagName('a') and p.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'a').
		// So find them recursively.
		hook_anchor(p);
		showingBalloonId = reminder_id;
	}

	ns.showDayTip = function(force) {
		var last_show_time = MOA.Lib.getFilePref('day_tip_show_time', null);

		if (!force) {
			if (!MOA.Lib.getFilePref('turn_on_day_tip', true)) {
				MOA.debug('Day tip has been turned off!');
				return;
			} else if (last_show_time) {
				var now = new Date();
				var last = new Date(last_show_time);
				if (new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime() >=
					new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
					MOA.debug('Tip has been show today.');
					return;
				}
			}

			MOA.Lib.setFilePref('day_tip_show_time', new Date().getTime());
		}

		_daytipreminders = MOA.RuleCenter.getDayTipReminders(force);
		this.nextDayTip();
	};

	ns.nextDayTip = function() {
		if (_daytipreminders.length == 0) {
			MOA.debug('Reminders is empty.');
			return;
		}

		_closePopup(function() {
			// set a interval to show next tip
			// make that popup's position will be refreshed.
			window.setTimeout(function() {
				_current_day_tip_reminder = _daytipreminders.shift();
				MOA.RuleCenter.clickOnNoMore(MOA.RuleCenter.getRID(_current_day_tip_reminder));
				_show_day_tips(_current_day_tip_reminder);
				_hide_daytip_countdown.start();
				_track_daytip();
			}, 1);
		});
	};

	ns.onClickNextDayTip = function() {
		_track_daytip('next');
		this.nextDayTip();
	};

	ns.onClickDayTipCloseIcon = function() {
		_track_daytip('closeicon');
		_closeDayTip();
	};

	ns.onClickDayTipClose = function() {
		_track_daytip('close');
		_closeDayTip();
	};

	ns.onClickDayTipTurnOff = function() {
		_track_daytip('turnoff');
		MOA.Lib.setFilePref('turn_on_day_tip', false);
		_closeDayTip();
	};

	ns.onMouseOverDayTip = function() {
		_hide_daytip_countdown.reset();
	};

	ns.onMouseOutDayTip = function() {
		_hide_daytip_countdown.start();
	};
	/************EOF****************/
})();
