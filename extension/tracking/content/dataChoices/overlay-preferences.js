/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
(function() {
  if (!window.gPrivacyPane) {
    return;
  }

  let strings = Services.strings.createBundle("chrome://cmtracking/locale/preferences.properties");
  let origInitSubmitCrashes = gPrivacyPane.initSubmitCrashes;
  gPrivacyPane.initSubmitCrashes = (...args) => {
    let body = document.querySelector("#dataCollectionGroup");

    let hbox = document.createElement("hbox");
    hbox.setAttribute("align", "center");
    let checkbox = document.createElement("checkbox");
    checkbox.setAttribute("preference", "extensions.cpmanager.tracking.enabled");
    checkbox.setAttribute("label", strings.GetStringFromName("mococnTracking.label"));
    checkbox.setAttribute("accesskey", strings.GetStringFromName("mococnTracking.accesskey"));
    hbox.appendChild(checkbox);
    let label = document.createElement("label");
    label.id = "mococnTrackingLearnMore";
    label.classList.add("learnMore");
    label.classList.add("text-link");
    label.textContent = strings.GetStringFromName("mococnTrackingLearnMore.label");
    hbox.appendChild(label);
    body.appendChild(hbox);

    gPrivacyPane._setupLearnMoreLink("extensions.cpmanager.tracking.infoURL", "mococnTrackingLearnMore");

    return origInitSubmitCrashes.apply(gPrivacyPane, args);
  };
})();
