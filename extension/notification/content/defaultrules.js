(function() {
	var ns = MOA.ns('DefaultRules');
	var _rules = {
		"reminders": [{
			"addon_id":"browser",
			"btn_id":"star-button",
			"type":"function",
			"dest":"tip",
			"times":1,"desc":"收藏网页？点这里！<br />一键收藏当前网页，Ctrl+B则可打开书签侧栏、对已经收藏的网页进行整理（看详细视频介绍点<a href=\"http://www.firefox.com.cn/video/?fid=1\">这里</a>）<br/& gt;"
		}, {
			"addon_id":"livemargins@mozillaonline.com",
			"btn_id":"appcenter-button",
			"type":"function",
			"dest":"tip",
			"times":1,"desc":"火狐魔镜全新升级为火狐应用中心<br />汇聚了众多实用工具、生活资讯、打折信息、音乐视频和网页游戏等网络应用，点击这里抢先体验吧<br/& gt;"
		}, {
			"addon_id":"share_all_cn@mozillaonline.com",
			"btn_id":"share-all-cn-bar",
			"type":"function",
			"dest":"tip",
			"times":1,"desc":"发微博，分享到QQ、人人？点这里！<br />将网页链接或图片直接分享到QQ、人人或新浪微博，任何时候都可实现一键分享<br />"
		}, {
			"addon_id":"livemargins@mozillaonline.com",
			"btn_id":"favpart-button",
			"type":"function",
			"dest":"tip",
			"times":1,"desc":"剪下网页中喜欢的部分？点这里！<br />新闻头条、股票走势、日程表、网页游戏、淘宝店铺。。。只有想不到，没有剪不到（看详细视频介绍点<a href=\"http://www.firefox.com.cn/video/?fid=0\">这里</a>）<br />"
		}, {
			"addon_id":"personas@christopher.beard",
			"btn_id":"personas-selector-button",
			"type":"function",
			"dest":"tip",
			"times":1,"desc":"更换皮肤？点这里！<br />立即给你的浏览器挑选皮肤，实时预览、一键生效（看详细视频介绍点<a href=\"http://www.firefox.com.cn/video/?fid=2\">这里</a>）<br/& gt;"
		}, {
			"addon_id":"browser",
			"btn_id":"quicklaunch-button",
			"type":"function",
			"dest":"tip",
			"times":1,"desc":"快捷调用？点这里！<br/>一键打开记事本、计算器、画图等系统程序，还有截图等常用操作（看详细视频介绍点<a href=\"http://www.firefox.com.cn/video/?fid=5\">这里</a>）<br/& gt;"
		}],
		"rules":[]
	};

	var _rules_ff4 = {
		"reminders": [{
			"addon_id":"browser",
			"btn_id":"star-button",
			"type":"function",
			"dest":"tip",
			"times":1,"desc":"收藏网页？点这里！<br />一键收藏当前网页，Ctrl+B则可打开书签侧栏、对已经收藏的网页进行整理<br/& gt;"
		}, {
			"addon_id":"livemargins@mozillaonline.com",
			"btn_id":"appcenter-button",
			"type":"function",
			"dest":"tip",
			"times":1,"desc":"火狐魔镜全新升级为火狐应用中心<br />汇聚了众多实用工具、生活资讯、打折信息、音乐视频和网页游戏等网络应用，点击这里抢先体验吧<br/& gt;"
		}, {
			"addon_id":"share_all_cn@mozillaonline.com",
			"btn_id":"share-all-cn-bar",
			"type":"function",
			"dest":"tip",
			"times":1,"desc":"发微博，分享到QQ、人人？点这里！<br />将网页链接或图片直接分享到QQ、人人或新浪微博，任何时候都可实现一键分享<br />"
		}, {
			"addon_id":"livemargins@mozillaonline.com",
			"btn_id":"favpart-button",
			"type":"function",
			"dest":"tip",
			"times":1,"desc":"剪下网页中喜欢的部分？点这里！<br />新闻头条、股票走势、日程表、网页游戏、淘宝店铺。。。只有想不到，没有剪不到<br />"
		}, {
			"addon_id":"browser",
			"btn_id":"quickluanch-addonbar",
			"type":"function",
			"dest":"tip",
			"times":1,"desc":"快捷调用？点这里！<br/>一键打开记事本、计算器、画图等系统程序，还有截图等常用操作<br/& gt;"
		}, {
			"addon_id":"personas@christopher.beard",
			"btn_id":"personas-toolbar-button",
			"type":"function",
			"dest":"tip",
			"times":1,"desc":"更换皮肤？点这里！<br />立即给你的浏览器挑选皮肤，实时预览、一键生效<br/& gt;"
		}],
		"rules":[]
	};

	ns.VERSION = '0.3';
	ns.getDefaultRules = function() {
		if (MOA.Lib.isFirefox4()) {
			return _rules_ff4;
		} else {
			return _rules;
		}
	};
})();
