/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

(function() {
  Cu.import('resource://gre/modules/ctypes.jsm');
  Cu.import('resource://gre/modules/LoadContextInfo.jsm');

  function init() {
    if (Services.appinfo.OS != 'WINNT') return;

    let lib = null;
    let file = null;

    let fileURI = Services.io.newURI('resource://copygif-binary', null, null);
    if (!(fileURI instanceof Ci.nsIFileURL)) {
      console.log('fileURI is not an nsIFileURL object');
      return;
    }

    lib = ctypes.open(fileURI.file.path);
    let setClipboard = lib.declare('setClipboard', ctypes.default_abi, ctypes.void_t, ctypes.jschar.ptr);
    let originGoDoCommand = goDoCommand;

    let maybeSetClipboard = function() {
      if (!file || !file.exists()) return;

      OS.File.read(file.path, 3).then(function(arr) {
        // File first 3 bytes are "GIF"
        if (arr[0] == 71 && arr[1] == 73 && arr[2] == 70) {
          setClipboard(file.path);
        }
      }, function() {
        console.log('read file failed!');
      })
    };

    goDoCommand = function(cmd) {
      originGoDoCommand(cmd);
      if (cmd != 'cmd_copyImage') return;

      file = null;
      let cacheService = Cc['@mozilla.org/netwerk/cache-storage-service;1']
          .getService(Ci.nsICacheStorageService);
      let storage = cacheService.diskCacheStorage(
          LoadContextInfo.fromLoadContext(PrivateBrowsingUtils.privacyContextFromWindow(window, false)),
          false);
      let uri = makeURI(gContextMenu.mediaURL);

      if (uri.scheme == 'file') {
        file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsILocalFile);
        let path = decodeURIComponent(uri.path.substr(1).replace(new RegExp('/', 'g'), '\\'));

        try {
          file.initWithPath(path);
          maybeSetClipboard();
        } catch(e) {
          console.log(e);
        }
        return;
      }

      storage.asyncOpenURI(uri, '', Ci.nsICacheStorage.OPEN_NORMALLY, {
        onCacheEntryCheck: function (entry, appcache) {
          return Ci.nsICacheEntryOpenCallback.ENTRY_WANTED;
        },
        onCacheEntryAvailable: function (entry, isnew, appcache, status) {
          if (status) return;
          let inputStream = entry.openInputStream(0);
          let fileName = new Date().getTime() + '.gif';
          file = FileUtils.getFile('TmpD', [fileName]);
          if (file.exists()) {
            console.log('file exist');
            file.remove(true);
          }
          file.create(Ci.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
          let outputStream = FileUtils.openSafeFileOutputStream(file);
          NetUtil.asyncCopy(inputStream, outputStream, maybeSetClipboard);
        }
      });
    };
  }

  window.addEventListener('load', function wnd_onload(e) {
    window.removeEventListener('load', wnd_onload);
    window.setTimeout(init, 1000);
  });

  window.addEventListener('unload', function wnd_onunload(e) {
    window.removeEventListener('unload', wnd_onunload);
    if (!lib) return;
    lib.close();
  });
})();
