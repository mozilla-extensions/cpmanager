(function() {
	var ns = MOA.ns('Tracker');

	var _trackurl = 'http://www.g-fox.cn/livemargins/notification.js';

	ns.track = function(option) {
		option = MOA.Lib.extend(option, {
			type: '',
			rid: '',
			action: ''
		});

		if (!option.type && !option.rid && !option.action)
			return;

		var image = new Image();
		image.src = _trackurl + '?r=' + Math.random()
			+ '&c=' + 'notification'
			+ '&t=' + encodeURIComponent(option.type)
			+ '&d=' + encodeURIComponent(option.rid)
			+ '&a=' + encodeURIComponent(option.action);
	};
})();
