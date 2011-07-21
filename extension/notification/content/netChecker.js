(function() {
	// initialize namespace
	var ns = MOA.ns('NetChecker');
	
	var Ci = Components.interfaces;
	
	var testRules = [{
		addon: {
			id: '{37fa1426-b82d-11db-8314-0800200c9a66}',
			xpi: 'http://dl1.g-fox.cn/community/addons/4490_local/addon-4490_local-latest.xpi',
			url: 'https://addons.mozilla.org/zh-CN/firefox/addon/4490/',
		},
		
		reminder: {
			type: 'addon',
			trigger: 'window',
			urls: [[
				'mail.163.com', 
				'http://[a-z0-9]+\\.mail\\.163\\.com/js3/main\\.jsp.+'
			], [
				'mail.qq.com', 
				'http://[a-z0-9]+\\.mail\\.qq\\.com/cgi-bin/frame_html.+'
			]],
			times: 3,	
			desc: '常用邮箱提醒功能！'
		}
	}, {
		addon: {
			id: 'livemargins@mozillaonline.com'
		},
		
		reminder: {
			type: 'function',
			trigger: 'window',
			urls: [[
				'v.youku.com', 
				'http://v\\.youku\\.com/v_show/id_[a-z0-9=]+\\.html'
			], [
				'www.tudou.com', 
				'http://www\\.tudou\\.com/playlist/playindex.do\\?lid=\\d+'
			]],
			times: 1,
			desc: '使用火狐剪报！',
			btn_id: 'favpart-button'
		}
	}, {
		addon: {
			id: '{455D905A-D37C-4643-A9E2-F6FEFAA0424A}',
			xpi: 'https://addons.mozilla.org/zh-CN/firefox/downloads/latest/953/addon-953-latest.xpi',
			url: 'https://addons.mozilla.org/zh-CN/firefox/addon/953/'
		},
		
		reminder: {
			type: 'addon',
			trigger: 'image',
			check_referer: true,
			urls: [[
				'imgcache.qq.com',
				'http://imgcache\\.qq\\.com/qzone/client/photo/swf/no\\.gif.*'			//qzone
			], [
				'imgsrc.baidu.com',
				'http://imgsrc\\.baidu\\.com/baike/abpic/item/[a-z0-9]\\.jpg'			//baike
			], [
				'hiphotos.baidu.com',
				'http://hiphotos\\.baidu\\.com/[^/]+/[a-z]*pic/item/[a-z0-9]+\\.jpg'	//baidu hi
			]],
			times: 4,
			desc: '轻松查看防盗链图片！'
		}
	}];
	
	var ruleCenter = {
		// accepted trigger types: window, document, image
		domainRules: {
			'window': {},
			'document': {},
			'image': {}
		},
		
		initialize: function(rules) {
			for (var i = 0, len = rules.length; i < len; i++) {
				var rule = rules[i];
				if (!rule.addon || !rule.addon.id || !rule.reminder || !rule.reminder.type || !rule.reminder.urls)
					continue;
				
				// accepted reminder types: addon, function
				switch(rule.reminder.type) {
					case 'addon':
						if (this.isAddonInstalled(rule.addon.id))
							continue;
						break;
					case 'function':
						if (!this.isAddonInstalled(rule.addon.id))
							continue;
						break;
					default:
						continue;
				}
				
				// check trigger type
				if (!this.domainRules[rule.reminder.trigger])
					continue;
					
				for (var j = 0, jlen = rule.reminder.urls.length; j < jlen; j++) {
					if (!this.domainRules[rule.reminder.trigger][rule.reminder.urls[j][0]]) {
						this.domainRules[rule.reminder.trigger][rule.reminder.urls[j][0]] = [];
					}
					
					// TODO  remember index in order to remove it quickly.
					this.domainRules[rule.reminder.trigger][rule.reminder.urls[j][0]].push({
						regexp: new RegExp(rule.reminder.urls[j][1], 'i'), 
						rule: rule
					});
				}
			}
		},
		
		isAddonInstalled: function(id) {
			// TODO Check if addon has been installed
			if (id == 'livemargins@mozillaonline.com')
				return true;
			return false;
		},
		
		getRulesRelated: function(type, domain) {
			return this.domainRules[type][domain];
		},
		
		getTypeRelated: function(info) {
			if (info.isImage)
				return 'image';
			else if (info.isWindowURI)
				return 'window';
			else if (info.isDocumentURI)
				return 'document';
				
			return null;
		},
		
		checkAndShow: function(httpChannel, info) {
			var type = this.getTypeRelated(info);
			if (null == type)
				return;
			
			var host = httpChannel.URI.host;
			var tmp = host.split('.');
			while (tmp.length > 1) {
				var rulesRelated = this.getRulesRelated(type, tmp.join('.'));
				if (null != rulesRelated) {
					for (var i = 0, len = rulesRelated.length; i < len; i++) {
						var rule = rulesRelated[i];
						if (rule.regexp.test(httpChannel.URI.spec)) {
							MOA.log('Rule valid: ' + rule.rule.reminder.desc);
							MOA.Notification.addNotification1(rule.rule, info);
						}
					}
				}
				
				tmp.shift();
			}
		}
	};
	ruleCenter.initialize(testRules);
	
	ns.checkResponse = function(httpChannel, info) {
		// if (info.isDocumentURI)
		// 	MOA.log('Referer: ' + httpChannel.referrer + ', uri: ' + httpChannel.URI.spec + '; isImage: ' + info.isImage + '; isWindow: ' + info.isWindowURI + '; isDocument: ' + info.isDocumentURI);
		
		ruleCenter.checkAndShow(httpChannel, info);
	};
})();