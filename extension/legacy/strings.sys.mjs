/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export let strings = {
  _extension: null,

  init(context) {
    this._extension = context.extension;
  },

  uninit() {
    delete this._extension;
  },

  _(name, subs) {
    if (!this._extension) {
      return "";
    }

    let cloneScope = this._ctx.cloneScope;
    return this._extension.localizeMessage(name, subs, {cloneScope});
  },
};
