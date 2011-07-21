(function() {
	var ns = MOA.ns('RuleCenter');
	/**
	 * reminders = {
	 * 	'{aaa-dddd-dddd-ddd}': {
	 * 	  addon_id: {aaa-dddd-dddd-ddd},
	 *    type: 'addon'
	 * 	  rules: {
	 * 		rules1_id: 1,
	 * 		rules2_id: 1,
	 *    }
	 * 	},
	 *  '{aaa-dddd-dddd-ddd}__btn_fav': ....
	 * }
	 *
	 * rules = {
	 * 	rule1_id: {
	 * 	  domian: 'abc.example.com',
	 * 	  regexp: 'http://abc.example.com/.+',
	 *    reminder: '{aaa-dddd-dddd-ddd}'			// reminder_id
	 *  },
	 *  rule2_id: ....
	 * }
	 *
	 * regexps = {
	 *  'abc.example.com': {
	 * 	  rule1_id: 1,
	 *    rule2_id: 1
	 *  },
	 *
	 *  'def.example2.com': ...
	 * }
	 *
	 */
	var reminders = {};
	var rules = {};
	var regexps = {};				// for rules which have trigger type: window

	ns.getRuleById = function(id) {
		return rules[id];
	};

	ns.getReminderById = function(rid) {
		return reminders[rid];
	};

	// remove reminder and rules/regexp related.
	ns.removeReminder = function(rid) {
		var reminder = this.getReminderById(rid);
		if (!reminder)
			return;

		for (var i = 0, len = reminder.rules.length; i < len; i++) {
			var rule_id = reminder.rules[i];
			var rule = rules[rule_id];

			switch (rule.trigger) {
				case 'window':
					var domain_regexps = regexps[rules[rule_id].domain];
					if (!!domain_regexps) {
						delete domain_regexps[rule_id];

						// if rules under domain is empty, delete domain
						var has_more = false;
						for (var tmp in domain_regexps) {
							has_more = true;
							break;
						}
						if (!has_more)
							delete regexps[rules[rule_id].domain];
					}
					break;
			}

			delete rules[reminder.rules[i]];
		}
		delete reminders[rid];
	};

	ns.getRID = function(reminder) {
		switch (reminder.type) {
			case 'addon':
				return reminder.addon_id;
			case 'function':
				return reminder.addon_id + '__' + reminder.btn_id;
		}
	};

	// TODO save hittimes
	var hittimes = {};
	ns.hitReminder = function(rid) {
		var reminder = this.getReminderById(rid);
		if (!hittimes[rid])
			hittimes[rid] = 0;

		hittimes[rid] = hittimes[rid] + 1;
		return hittimes[rid] >= (reminder.times ? reminder.times : 1);
	};

	ns.checkAndShow = function(httpChannel, info) {
		if (!info.isWindowURI)
			return;

		var host = httpChannel.URI.host;
		var tmp = host.split('.');
		while (tmp.length > 1) {
			var rule_related = regexps[tmp.join('.')];
			for (var rule_id in rule_related) {
				var rule = this.getRuleById(rule_id);
				if (new RegExp(rule.regexp, 'i').test(httpChannel.URI.spec)) {
					if (this.hitReminder(rule.reminder)) {
						MOA.log('Rule valid: ' + this.getReminderById(rule.reminder).desc);
						MOA.Notification.addNotification(rule.reminder, info);
					}
				}
			}
			tmp.shift();
		}
	};

	ns.clickOnInstall = function(reminder_id) {
		MOA.Lib.setFilePref(reminder_id + '__nomore', new Date().getTime());
	};

	ns.clickOnNoMore = function(reminder_id) {
		MOA.Lib.setFilePref(reminder_id + '__nomore', new Date().getTime());
	};

	ns.clickOnLater = function(reminder_id) {
		MOA.Lib.setFilePref(reminder_id + '__later', new Date().getTime());
	};

	ns.reload = function() {
		MOA.Notification.clearAll();
		MOA.Lib.clearFilePrefs();
		reminders = {};
		regexps = {};
		rules = {};
		init();
	};

	ns.getTipReminders = function() {
		var defaultRules = _getReminderRules();
		var tip_reminders = [];
		for (var i = 0, len = defaultRules.reminders.length; i < len; i++) {
			var reminder = defaultRules.reminders[i];
			if (reminder.dest == 'tip') {
				var btn = MOA.Lib.get(reminder.btn_id);
				// make sure function button is visible.
				if (btn && btn.hidden == false && btn.clientWidth > 0) {
					tip_reminders.push(reminder);
				}
			}
		}
		return tip_reminders;
	};

	ns.getDayTipReminders = function(force) {
		var defaultRules = _getReminderRules();
		var tip_reminders = [];

		for (var i = 0, len = defaultRules.reminders.length; i < len; i++) {
			var reminder = defaultRules.reminders[i];

			if (reminder.dest != 'tip')
				continue;
			if(!force && !!MOA.Lib.getFilePref(this.getRID(reminder) + '__nomore', false))
				continue;

			var btn = MOA.Lib.get(reminder.btn_id);
			// make sure function button is visible.
			if (btn && btn.hidden == false && btn.clientWidth > 0) {
				tip_reminders.push(reminder);
			}
		}
		return tip_reminders;
	};

	/**
	 * Read rules from rules.json.
	 * If it is null, use default_rules and save it to pref.
	 */
	function _getReminderRules() {
		var reminder_rules = null;

		var version = null;
		try {
			version = MOA.Lib.getPrefs().getCharPref('default_rules_version', '0');
		} catch (err) {}

		if (version != MOA.DefaultRules.VERSION) {
			MOA.debug('Default rules\' version has been updated, empty rules.json')
			MOA.Lib.setStrToProFile(MOA.Lib.getProFilePath('rules.json'), '');
			MOA.Lib.getPrefs().setCharPref('default_rules_version', MOA.DefaultRules.VERSION);
		} else {
			try {
				reminder_rules = JSON.parse(MOA.Lib.readStrFromProFile(MOA.Lib.getProFilePath('rules.json')));
			} catch (err) { }
		}

		if (!reminder_rules) {
			reminder_rules = MOA.DefaultRules.getDefaultRules();
			// MOA.Lib.setStrToProFile(MOA.Lib.getProFilePath('rules.json'), JSON.stringify(reminder_rules));
		}

		return reminder_rules;
	}

	function init() {
		var defaultRules = _getReminderRules();
		var prefs = MOA.Lib.getFilePrefs();
		var now = new Date().getTime();
		for (var i = 0, len = defaultRules.reminders.length; i < len; i++) {
			var reminder = defaultRules.reminders[i];
			var rid = MOA.RuleCenter.getRID(reminder);

			// 30 days
			if (!!prefs[rid + '__nomore'] && prefs[rid + '__nomore'] - now < 2592000000)
				continue;

			// one day
			if (!!prefs[rid + '__later'] && prefs[rid + '__later'] - now < 86400000)
				continue;

			switch (reminder.type) {
				case 'addon':
					if (MOA.Lib.isAddonInstalled(reminder.addon_id))
						continue;
					break;
				case 'function':
					// if addon_id is browser, it means this reminder is for browser functions.
					if (reminder.addon_id != 'browser' && !MOA.Lib.isAddonEnabled(reminder.addon_id))
						continue;
					break;
			}

			reminders[rid] = reminder;
			reminder.rules = [];			// rules' id which uses the reminder
		}

		var rule_id = 0;
		for (var i = 0, len = defaultRules.rules.length; i < len; i++) {
			// break composite rules into singles.
			var com_rules = defaultRules.rules[i];

			for (var j = 0, jlen = com_rules.reminders.length; j < jlen; j++) {
				var rule = {
					trigger: com_rules.trigger,
					domain: com_rules.domain,
					regexp: com_rules.regexp,
					reminder: com_rules.reminders[j]
				};
				var reminder = reminders[rule.reminder];
				if (!reminder)
					continue;

				rules[rule_id] = rule;

				// remember rules' id
				reminder.rules.push(rule_id);

				switch (rule.trigger) {
					case 'window':
						if (!regexps[rule.domain])
							regexps[rule.domain] = {};
						regexps[rule.domain][rule_id] = 1;
						break;
				}

				rule_id++;
			}
		}
	};

	init();

	// Read rules from server periodically.
	function _update_rules() {
		var last_update = MOA.Lib.getFilePref('update_rule_from_server', 0);

		if ('' != MOA.Lib.readStrFromProFile(MOA.Lib.getProFilePath('rules.json'))
			&& (new Date().getTime() - last_update) < 1000 * 60 * 60 * 24 * 7) {
			MOA.debug('Rules has been updated in a week, skip.');
			return;
		}

		var _updateurl = null;
		try {
			if (MOA.Lib.isFirefox4()) {
				_updateurl = MOA.Lib.getPrefs().getCharPref('rules_update_url_ff4');
			} else {
				_updateurl = MOA.Lib.getPrefs().getCharPref('rules_update_url');
			}
		} catch (e) {
			MOA.Log('Update url does not exists, abort.');
			return;
		}

		MOA.debug('Update rules from server.');
		MOA.Lib.httpGet(_updateurl, function(response) {
			if (response.readyState == 4 && 200 == response.status) {
				var rules = null;
				try {
					rules = JSON.parse(response.responseText);
				} catch (err) {
					MOA.log('Rules file\' format is wrong: ' + err);
				}

				if (rules) {
					MOA.Lib.setStrToProFile(MOA.Lib.getProFilePath('rules.json'), response.responseText);
					MOA.Lib.setFilePref('update_rule_from_server', new Date().getTime());
				}
			}
		});
	}

	var _interval = 1000 * 5;
	try {
		_interval = MOA.Lib.getPrefs().getIntPref('daytip_time_after_load');
		MOA.debug('daytip_time_after_load: ' + _interval);
	} catch (e) {
		MOA.debug('daytip_time_after_load is null.');
	}
	window.setTimeout(_update_rules, _interval);
})();
