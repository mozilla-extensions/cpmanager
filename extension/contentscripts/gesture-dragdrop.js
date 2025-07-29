/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const GestureDragDrop = {
  // We want to know the "true" source of the drag, which we can no longer
  // reliably get from the drag session in Gecko 1.9.1
  _sourceNode: null,

  _startX: -1,
  _startY: -1,
  _listening: false,

  async init() {
    document.addEventListener("dragstart", (e) => this.dragstart(e));
    document.addEventListener("dragover", (e) => this.dragover(e));
    document.addEventListener("drop", (e) => this.dragdrop(e));

    this._listening = await browser.runtime.sendMessage({
      type: "query",
      data: "listening",
    });
  },

  _fromSameContentArea( node1, node2 ) {
    return (
      node1 && node2 &&
      node1.ownerGlobal &&
      node1.ownerGlobal.top &&
      node2.ownerGlobal &&
      node2.ownerGlobal.top &&
      node1.ownerGlobal.top.document === node2.ownerGlobal.top.document
    );
  },

  _canDropLink(evt) {
    const dt = evt.dataTransfer;
    if (!dt || !dt.types) return false;

    const types = Array.from(dt.types);
    return types.includes("application/x-moz-file") ||
           types.includes("text/x-moz-url") ||
           types.includes("text/uri-list") ||
           types.includes("text/x-moz-text-internal") ||
           types.includes("text/plain");
  },

  _shouldHandleEvent(evt) {
    return (
      this._listening && this._canDropLink(evt) &&
      ( evt.dataTransfer.mozSourceNode == null ||
        this._fromSameContentArea(evt.dataTransfer.mozSourceNode, evt.target) )
    );
  },

  /**
   * The Original Code is QuickDrag.
   * Version: MPL 1.1/GPL 2.0/LGPL 2.1
   *
   * The Initial Developer of the Original Code is Kai Liu.
   * Portions created by the Initial Developer are Copyright (C) 2008-2009
   * the Initial Developer. All Rights Reserved.
   *
   * Contributor(s):
   *   Kai Liu <kliu@code.kliu.org>
   *
   * Modified by Jia Mi and others from Mozilla Beijing office.
   **/

  // Similar to nsDragAndDrop.js's data retrieval; see nsDragAndDrop.drop
  _getDragData(aEvent) {
    var data = "";
    var type = "text/unicode";

    if ("dataTransfer" in aEvent) {
      // Gecko 1.9.1 and newer: WHATWG drag-and-drop

      // Try to get text/x-moz-url, if possible
      let selection = "";
      let sel = window.getSelection();
      if (sel) {
        let text = sel.toString();
        if (text) {
          selection = text;
        }
      }

      selection = selection ? selection.toString() : "";
      data = aEvent.dataTransfer.getData("text/x-moz-url");

      if (data.length != 0) {
        var lines = data.replace(/^\s+|\s+$/g, "").split(/\s*\n\s*/);
        if (lines.length > 1 && lines[1] === selection) {
          type = "text/unicode";
          data = selection;
        } else {
          type = "text/x-moz-url";
        }
      } else {
        data = aEvent.dataTransfer.getData("text/plain");
      }
    }

    return ({ data, type });
  },

  fireDragGestureEvent(event) {
    this.onDragGesture(event);

    this._startX = -1;
    this._startY = -1;
  },

  dragstart(evt) {
    this._sourceNode = evt.explicitOriginalTarget;
    this._startX = evt.pageX;
    this._startY = evt.pageY;
  },

  dragover(evt) {
    if (!this._shouldHandleEvent(evt)) {
      return;
    }
    evt.preventDefault();
  },

  dragdrop(evt) {
    if (!this._shouldHandleEvent(evt)) {
      return;
    }
    // Get the source node and name
    var sourceNode = evt.dataTransfer.mozSourceNode;

    if (this._sourceNode) {
      sourceNode = this._sourceNode;
      this._sourceNode = null;
    }

    var sourceName = (sourceNode) ? sourceNode.nodeName : "";

    // Flags
    var isURI = false;
    var isImage = false;

    // Parse the drag data
    var dragData = this._getDragData(evt);
    var lines = dragData.data.replace(/^\s+|\s+$/g, "").split(/\s*\n\s*/);
    var str = lines.join(" ");

    if (dragData.type == "text/x-moz-url") {
      // The user has dragged either a link or an image

      // By default, we want to use the URI (the first line)
      str = lines[0];
      isURI = true;

      if (sourceName == "IMG") {
        // Image or image link
        isImage = true;
      }
    }

    // Abort if we have no data; otherwise, proceed with URI detection
    if (!str) return;

    // Our heuristics; see bug 58 for info about the http fixup
    var hasScheme = /^(?:(?:h?tt|hxx)ps?|ftp|chrome|file):\/\//i;
    var hasIP = /(?:^|[\/@])(?:\d{1,3}\.){3}\d{1,3}(?:[:\/\?]|$)/;
    var hasDomain = new RegExp(
      // starting boundary
      "(?:^|[:\\/\\.@])" +
      // valid second-level name
      "[a-z0-9](?:[a-z0-9-]*[a-z0-9])" +
      // valid top-level name: ccTLDs + hard-coded [gs]TLDs
      "\\.(?:[a-z]{2}|aero|asia|biz|cat|com|coop|edu|gov|info|int|jobs|mil|mobi|museum|name|net|org|pro|tel|travel)" +
      // end boundary
      "(?:[:\\/\\?]|$)",
      // ignore case
      "i"
    );

    isURI = isURI || hasScheme.test(str);
    isURI = isURI || (!/\s/.test(str) && (hasIP.test(str) || hasDomain.test(str)));

    if (isURI) {
      // The scheme fixup here is more relaxed; patterns that match this
      // fixup but that failed the initial scheme heuristic are those
      // that match a valid domain or IP address pattern
      str = str.replace(/^(?:t?t|h[tx]{2,})p(s?:\/\/)/i, "http$1");

      // Call dragDropSecurityCheck... maybe?
      evt.dataTransfer.getData("text/plain");

      // Send the referrer only for embedded images or emulated
      // middle clicks over HTTP/HTTPS
      if (sourceNode) {
        let referrer = sourceNode &&
                       sourceNode.ownerDocument &&
                       sourceNode.ownerDocument.location &&
                       sourceNode.ownerDocument.location.href || "";
        if (!referrer) return;
      }

      // Turn naked e-mail addresses into mailto: links
      if (/^[\w\.\+\-]+@[\w\.\-]+\.[\w\-]{2,}$/.test(str))
        str = "mailto:" + str;

      // For image links, the we want to use the source URL unless we
      // are going to treat the image as a link
      var dropEvent = {};
      dropEvent.type = "link";

      if (isImage) {
        str = sourceNode.src;
        dropEvent.type = "image";
      }

      dropEvent.data = str;
      dropEvent.startX = this._startX;
      dropEvent.startY = this._startY;
      dropEvent.endX = evt.pageX;
      dropEvent.endY = evt.pageY;

      // Link + Image
      this.fireDragGestureEvent(dropEvent);
    } else {
      // Text
      this.fireDragGestureEvent({
        type: "text",
        data: str,
        startX: this._startX,
        startY: this._startY,
        endX: evt.pageX,
        endY: evt.pageY,
      });
    }

    evt.preventDefault();
    evt.stopPropagation();
  },

  onDragGesture(event) {
    var deltaX = event.endX - event.startX;
    var deltaY = event.endY - event.startY;

    if (deltaX * deltaX + deltaY * deltaY <= 25) {
      // not drag long enough I think
      return;
    }

    browser.runtime.sendMessage({
      type: event.type,
      data: event.data,
    });
  },

};

GestureDragDrop.init();
