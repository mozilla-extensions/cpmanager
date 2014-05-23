/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
function _(key) {
  return l10n[key];
}

var requestId = 0;
var callbacks = {};

function sendMessage(aPayload, aCallback) {
  aPayload._rid_ = ++requestId;
  if (aCallback) {
    callbacks[requestId] = aCallback;
  }
  self.port.emit('message', aPayload);
}

self.port.on('message', function(aData) {
  if (aData._rid_ && typeof callbacks[aData._rid_] == 'function') {
    try {
      callbacks[aData._rid_](aData);
    } catch (e) { }
    delete callbacks[aData._rid_];
  }
});

function injectFxaFlag(aEnabled) {
  let flag = document.createElement('span');
  flag.id = 'cn-fxa-flag';
  if (aEnabled) {
    flag.textContent = _('fxa.page.flag.local');
    flag.title = _('fxa.page.tooltip.localServices');
  } else {
    flag.textContent = _('fxa.page.flag.global');
    flag.dataset.entry = 'global';
  }
  document.body.querySelector('#intro h1').appendChild(flag);
}

function injectFxaSwitchButton(aLocalServiceEnabled) {
  let div = document.createElement('div');
  div.id = 'cn-fxa-switcher';
  if (aLocalServiceEnabled) {
    div.innerHTML = '<a href="#">' + _('fxa.page.toggler.switchToGlobal') + '</a>';
  } else {
    div.innerHTML = '<a href="#">' + _('fxa.page.toggler.switchToLocal') + '</a>';
    div.title = _('fxa.page.tooltip.localServices');
  }
  div.onclick = function() {
    toggleService(aLocalServiceEnabled);
  }
  document.body.querySelector('#intro h1').appendChild(div);
}

function toggleService(aLocalServiceEnabled) {
  if (aLocalServiceEnabled) {
    sendMessage({
      message: 'resetFxaServices'
    });
  } else {
    sendMessage({
      message: 'switchToLocalService'
    });
  }
}

sendMessage({
  message: 'localServiceEnabled'
}, function(aData) {
  injectFxaFlag(aData.enabled);
  injectFxaSwitchButton(aData.enabled);
});

