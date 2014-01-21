//cert error
(function() {
Components.utils.import("resource://gre/modules/Services.jsm");
function $(id) {return document.getElementById(id);}
var _bundles = Cc["@mozilla.org/intl/stringbundle;1"].
        getService(Ci.nsIStringBundleService).
        createBundle("chrome://cmimprove/locale/browser.properties");
function getString(key) {
  return _bundles.GetStringFromName(key);
}

var cmImprove_CE = {
  iFrameCertFix: function(evt) {
    var contentDoc = evt.target;
    if (contentDoc.documentURI.match(/^about:certerror/) && contentDoc.defaultView !== contentDoc.defaultView.top && !contentDoc.querySelector('#exceptionDialogButton')) {
      var iframeCert = Application.prefs.getValue("extensions.cmimprove.iframe_cert_fix.whitelist", "").split(',');
      if (iframeCert.some(function(host) contentDoc.location.host == host )) {
/*
        <div id="expertContent" collapsed="true">
          <h2 onclick="toggle('expertContent');" id="expertContentHeading">&certerror.expert.heading;</h2>
          <div>
            <p>&certerror.expert.content;</p>
            <p>&certerror.expert.contentPara2;</p>
            <button id='exceptionDialogButton'>&certerror.addException.label;</button>
          </div>
        </div>
*/
        var div = contentDoc.createElement('div');
        div.id = 'expertContent';
        div.setAttribute('collapsed', 'true');
        contentDoc.querySelector('#technicalContent').parentNode.appendChild(div);
        contentDoc.querySelector('#expertContent').innerHTML = ["<h2 onclick=\"toggle('expertContent');\" id=\"expertContentHeading\">",
            getString("certerror.expert.heading"),
            "</h2><div><p>",
            getString("certerror.expert.content"),
            "</p><p>",
            getString("certerror.expert.contentPara2"),
            "</p><button id='exceptionDialogButton'>",
            getString("certerror.addException.label"),
            "</button></div>"].join('');
      }
    }
    if (contentDoc.documentURI.match(/^about:certerror/) && contentDoc.defaultView !== contentDoc.defaultView.top && contentDoc.querySelector('#expertContent').hasAttribute('hidden')) {
      var iframeCert = Application.prefs.getValue("extensions.cmimprove.iframe_cert_fix.whitelist", "").split(',');
      if (iframeCert.some(function(host) contentDoc.location.host == host )) {
        contentDoc.querySelector('#expertContent').removeAttribute('hidden');
      }
    }
  },
  init: function() {
    $('appcontent').addEventListener('DOMContentLoaded', cmImprove_CE.iFrameCertFix, false);
  },
  uninit: function() {
    $('appcontent').removeEventListener('DOMContentLoaded', cmImprove_CE.iFrameCertFix, false);
  },
}

window.addEventListener('load'  , cmImprove_CE.init, false)
window.addEventListener('unload', cmImprove_CE.uninit, false)
})();
