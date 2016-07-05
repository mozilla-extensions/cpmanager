let DragDropObserver = {
  // We want to know the "true" source of the drag, which we can no longer
  // reliably get from the drag session in Gecko 1.9.1
  _sourceNode: null,

  _startX: -1,
  _startY: -1,

  _listening: false,
  messageName: "cpmanager@mozillaonline.com:dragAndDrop",

  receiveMessage: function(msg) {
    this._listening = msg.data.listening;
  },

  observe: function(subject, topic, data) {
    switch (topic) {
      case "content-document-global-created":
        if (!content || !subject || subject.top !== content) {
          return;
        }
        this.init(subject);
        break;
    }
  },

  init: function(subject) {
    subject.addEventListener("DOMContentLoaded", this, false);
    subject.addEventListener("unload", this, false);

    if (subject.top !== subject) {
      return;
    }

    sendAsyncMessage(this.messageName, {
      data: "listening",
      type: "query"
    });
  },

  fireDragGestureEvent: function(event) {
    this.onDragGesture(event);

    this._startX = -1;
    this._startY = -1;
  },

  attachWindow: function(event) {
    event.target.addEventListener("dragstart", this, false);
    event.target.addEventListener("dragover", this, false);
    event.target.addEventListener("drop", this, false);
  },

  detachWindow: function(event) {
    event.target.removeEventListener("dragstart", this, false);
    event.target.removeEventListener("dragover", this, false);
    event.target.removeEventListener("drop", this, false);
  },

  handleEvent: function(event) {
    switch(event.type) {
      case "dragstart":
        this.dragstart(event);
        break;
      case "dragover":
        this.dragover(event);
        break;
      case "drop":
        this.dragdrop(event);
        break;
      case "DOMContentLoaded":
        this.attachWindow(event);
        break;
      case "unload":
        this.detachWindow(event);
        break;
    }
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
  _getDragData: function( aEvent ) {
    var data = "";
    var type = "text/unicode";

    if ("dataTransfer" in aEvent) {
      // Gecko 1.9.1 and newer: WHATWG drag-and-drop

      // Try to get text/x-moz-url, if possible
      var selection = content.getSelection();
      selection = selection ? selection.toString() : "";
      data = aEvent.dataTransfer.getData("text/x-moz-url");

      if (data.length != 0) {
        var lines = data.replace(/^\s+|\s+$/g, "").split(/\s*\n\s*/);
        if (lines.length > 1 && lines[1] === selection)  {
          type = "text/unicode";
          data = selection;
        } else {
          type = "text/x-moz-url";
        }
      } else {
        data = aEvent.dataTransfer.getData("text/plain");
      }
    }

    return({ data: data, type: type });
  },

  // Similar to nsDragAndDrop.dragDropSecurityCheck
  _securityCheck: function( aEvent ) {
    let name = {};
    return Services.droppedLinkHandler.dropLink(aEvent, name, true);
  },

  // Determine if two DOM nodes are from the same content area.
  _fromSameContentArea: function( node1, node2 ) {
    return(
      node1 && node1.ownerDocument && node1.ownerDocument.defaultView &&
      node2 && node2.ownerDocument && node2.ownerDocument.defaultView &&
      node1.ownerDocument.defaultView.top.document == node2.ownerDocument.defaultView.top.document
    );
  },

  // Is this an event that we want to handle?
  _shouldHandleEvent: function( evt ) {
    return (
      this._listening &&
      Services.droppedLinkHandler.canDropLink(evt, true) &&
      ( evt.dataTransfer.mozSourceNode == null ||
        this._fromSameContentArea(evt.dataTransfer.mozSourceNode, evt.target) )
    );
  },

  /**
   * Event handlers
   **/

  dragstart: function( evt ) {
    this._sourceNode = evt.explicitOriginalTarget;
    this._startX = evt.pageX;
    this._startY = evt.pageY;
  },

  dragover: function( evt ) {
    if (!this._shouldHandleEvent(evt)) {
      return;
    }
    evt.preventDefault();
  },

  dragdrop: function( evt ) {
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
    var isAnchorLink = false;

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

        // If the URI does not match the source node, then this is a
        // linked image (note that we DO want to treat images linked to
        // themselves as if they are not linked at all)
        if (sourceNode.src != str)
          isAnchorLink = true;
      } else if (sourceName == "#text") {
        // Text link
        isAnchorLink = true;
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

      // Call dragDropSecurityCheck
      this._securityCheck(evt);

      // Send the referrer only for embedded images or emulated
      // middle clicks over HTTP/HTTPS
      var referrer = null;
      if (sourceNode) {
        referrer = Services.io.newURI(sourceNode.ownerDocument.location.href, null, null);

        if (!(isImage && /^https?$/i.test(referrer.scheme)))
          referrer = null;
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
        endY: evt.pageY
      });
    }

    evt.preventDefault();
    evt.stopPropagation();
  },

  onDragGesture: function(event) {
    var deltaX = event.endX - event.startX;
    var deltaY = event.endY - event.startY;

    if (deltaX * deltaX + deltaY * deltaY <= 25) {
      // not drag long enough I think
      return false;
    }

    sendAsyncMessage(this.messageName, {
      data: event.data,
      type: event.type
    });
  }
};

addMessageListener(DragDropObserver.messageName, DragDropObserver);
Services.obs.addObserver(DragDropObserver, "content-document-global-created", false);
