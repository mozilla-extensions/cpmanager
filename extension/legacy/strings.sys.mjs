/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export let strings = {
  _ctx: null,

  init(context) {
    this._ctx = context;
  },

  uninit() {
    delete this._ctx;
  },

  _(name, subs) {
    if (!this._ctx) {
      return "";
    }

    let cloneScope = this._ctx.cloneScope;
    return this._ctx.extension.localizeMessage(name, subs, {cloneScope});
  },
};
