const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

const MIGRATOR = Ci.nsIBrowserProfileMigrator;

const LOCAL_FILE_CID = "@mozilla.org/file/local;1";
const FILE_INPUT_STREAM_CID = "@mozilla.org/network/file-input-stream;1";

const BUNDLE_MIGRATION = "chrome://cmimprove/locale/migration.properties";


Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/PlacesUtils.jsm");
Components.utils.import("resource://gre/modules/NetUtil.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");


["LOG", "WARN", "ERROR"].forEach(function(aName) {
  this.__defineGetter__(aName, function() {
    Cu.import("resource://gre/modules/AddonLogging.jsm");

    LogManager.getLogger("360", this);
    return this[aName];
  });
}, this);

XPCOMUtils.defineLazyGetter(this, "bookmarksSubfolderTitle", function () {
  let strbundle =
    Services.strings.createBundle(BUNDLE_MIGRATION);
  let sourceName = strbundle.GetStringFromName("sourceName360se");
  return strbundle.formatStringFromName("importedBookmarksFolder",
                                        [sourceName],
                                        1);
});
function parseINIStrings(file) {
  var factory = Cc["@mozilla.org/xpcom/ini-parser-factory;1"].
                getService(Ci.nsIINIParserFactory);
  var parser = factory.createINIParser(file);
  var obj = {};
  var en = parser.getKeys("NowLogin");
  while (en.hasMore()) {
    var key = en.getNext();
    obj[key] = parser.getString("NowLogin", key);
  }
  return obj;
}
function getHash(aStr,algorithm) {
  algorithm = algorithm || Ci.nsICryptoHash.MD5;
  // return the two-digit hexadecimal code for a byte
  function toHexString(charCode)
    ("0" + charCode.toString(16)).slice(-2);

  var hasher = Cc["@mozilla.org/security/hash;1"].
               createInstance(Ci.nsICryptoHash);
  hasher.init(algorithm);
  var stringStream = Cc["@mozilla.org/io/string-input-stream;1"].
                     createInstance(Ci.nsIStringInputStream);
                     stringStream.data = aStr ? aStr : "null";
  hasher.updateFromStream(stringStream, -1);

  // convert the binary hash data to a hex string.
  var binary = hasher.finish(false);
  var hash = [toHexString(binary.charCodeAt(i)) for (i in binary)].join("").toLowerCase();
  return hash ;
}
function createStatement(conn, sql) {
  if (!conn) return;
  
  try {
    var statement = conn.createStatement(sql);
    return statement;
  } catch(e) {
    ERROR(conn.lastErrorString);
  }
}

function insertBookmarkItems(aParentId, aFolderId, dbConn)
{
  var sql = 'SELECT id, title, url, is_folder FROM tb_fav WHERE parent_id=' + aParentId + ' ORDER BY "pos"';
  var places = [];
  var statement = createStatement(dbConn, sql);
  try {
    while (statement.executeStep()) {
      places.push({
        id        : statement.getUTF8String(0),
        title     : statement.getUTF8String(1),
        url       : statement.getUTF8String(2),
        is_folder : statement.getUTF8String(3),
      });
    }
  } finally {
    statement.reset();
  }
  for (let i = 0; i < places.length; i++) {
    let item = places[i];

    try {
      if (item.is_folder == "0") {
        PlacesUtils.bookmarks.insertBookmark(aFolderId,
                                             NetUtil.newURI(item.url),
                                             PlacesUtils.bookmarks.DEFAULT_INDEX,
                                             item.title);
      } else if (item.is_folder == "1") {
        let newFolderId =
          PlacesUtils.bookmarks.createFolder(aFolderId,
                                             item.title,
                                             PlacesUtils.bookmarks.DEFAULT_INDEX);

        insertBookmarkItems(item.id, newFolderId, dbConn);
      }
    } catch (e) {
      ERROR(e);
    }
  }
  
}

function ns360seMigrator()
{
}

ns360seMigrator.prototype = {
  _paths: {
    bookmarks : null,
    cookies : null,
    history : null,
    prefs : null,
    userData : null,
  },

  _homepageURL : null,
  _replaceBookmarks : false,
  _sourceProfile: null,
  _profilesCache: null,

  _notifyStart : function (aType)
  {
    Services.obs.notifyObservers(null, "Migration:ItemBeforeMigrate", aType);
    this._pendingCount++;
  },

  _notifyError : function (aType)
  {
    Services.obs.notifyObservers(null, "Migration:ItemError", aType);
  },

  _notifyCompleted : function (aType)
  {
    Services.obs.notifyObservers(null, "Migration:ItemAfterMigrate", aType);
    if (--this._pendingCount == 0) {
      // All items are migrated, so we have to send end notification.
      Services.obs.notifyObservers(null, "Migration:Ended", null);
    }
  },

  _migrateBookmarks : function ()
  {
    this._notifyStart(MIGRATOR.BOOKMARKS);

    try {
      PlacesUtils.bookmarks.runInBatchMode({
        _self : this,
        runBatched : function (aUserData) {
          let migrator = this._self;
          let file = Cc[LOCAL_FILE_CID].createInstance(Ci.nsILocalFile);
          file.initWithPath(migrator._paths.bookmarks);

          let dbConn = Services.storage.openUnsharedDatabase(file);
          // Toolbar
          let parentFolder = PlacesUtils.toolbarFolderId;
          if (!migrator._replaceBookmarks) { 
            parentFolder =
              PlacesUtils.bookmarks.createFolder(parentFolder,
                                                 bookmarksSubfolderTitle,
                                                 PlacesUtils.bookmarks.DEFAULT_INDEX);
          }
          insertBookmarkItems("0",parentFolder, dbConn)
        }
      }, null);
    } catch (e) {
      Cu.reportError(e);
      this._notifyError(MIGRATOR.BOOKMARKS);
      this._notifyCompleted(MIGRATOR.BOOKMARKS);
    }

    this._notifyCompleted(MIGRATOR.BOOKMARKS);
  },

  _migrateHistory : function ()
  {
    Cu.reportError("360se does not support migrate history");
  },

  _migrateCookies : function ()
  {
    Cu.reportError("360se does not support migrate cookies");
  },

  // 
  // nsIBrowserProfileMigrator interface implementation
  // 

  migrate : function (aItems, aStartup, aProfile)
  {
    if (aStartup) {
      aStartup.doStartup();
      this._replaceBookmarks = true;
    }

    this._sourceProfile = aProfile;

    Services.obs.notifyObservers(null, "Migration:Started", null);

    // Reset panding count.  If this count becomes 0, "Migration:Ended"
    // notification is sent
    this._pendingCount = 1;

    if (aItems & MIGRATOR.HISTORY)
      this._migrateHistory();

    if (aItems & MIGRATOR.COOKIES)
      this._migrateCookies();

    if (aItems & MIGRATOR.BOOKMARKS)
      this._migrateBookmarks();

    if (--this._pendingCount == 0) {
      Services.obs.notifyObservers(null, "Migration:Ended", null);
    }

  },

  getMigrateData: function (aProfile, aDoingStartup)
  {
    this._sourceProfile = aProfile;
    let profileDir = Cc[LOCAL_FILE_CID].createInstance(Ci.nsILocalFile);
    profileDir.initWithPath(this._paths.userData + aProfile);

    let result = 0;
    if (!profileDir.exists() || !profileDir.isReadable())
      return result;

    try {
      let file = profileDir.clone();
      file.append("360sefav.db");
      if (file.exists()) {
        this._paths.bookmarks = file.path;
        result += MIGRATOR.BOOKMARKS;
      }
    } catch (e) {
      Cu.reportError(e);
    }
    return result;
  },

  get sourceExists()
  {
    this._paths.userData = Services.dirsvc.get("AppData", Ci.nsIFile).path +
                            "\\360se\\";
    let result = 0;
    try {
      let userDataDir = Cc[LOCAL_FILE_CID].createInstance(Ci.nsILocalFile);
      userDataDir.initWithPath(this._paths.userData);
      if (!userDataDir.exists() || !userDataDir.isReadable())
        return false;

      let profiles = this.sourceProfiles;
      if (profiles.length < 1)
        return false;

      // check that we can actually get data from the first profile
      result = this.getMigrateData(profiles.queryElementAt(0, Ci.nsISupportsString), false);
    } catch (e) {
      Cu.reportError(e);
    }
    return result > 0;

  },

  get sourceHasMultipleProfiles()
  {
    return this.sourceProfiles.length > 1;
  },

  get sourceProfiles()
  {
    let profiles = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
    try {
      if (!this._profilesCache) {
        let localState = Cc[LOCAL_FILE_CID].createInstance(Ci.nsILocalFile);
        localState.initWithPath(this._paths.userData + "login.ini");
        if (!localState.exists())
          throw new Components.Exception("360se's 'login.ini' does not exist.",
                                         Cr.NS_ERROR_FILE_NOT_FOUND);
        if (!localState.isReadable())
          throw new Components.Exception("360se's 'login.ini' file could not be read.",
                                         Cr.NS_ERROR_FILE_ACCESS_DENIED);
        var localStateObj = parseINIStrings(localState);
        var userDir = "data";
        if ('IsAuto' in localStateObj && localStateObj.IsAuto == 1 && 'NickName' in localStateObj)
          userDir = getHash(localStateObj.NickName);
      }
        
        let str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
        str.data = userDir;
        profiles.appendElement(str, false);
    } catch (e) {
      Cu.reportError("Error detecting 360se profiles: " + e);
      if (profiles.length < 1) {
        let str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
        str.data = "data";
        profiles.appendElement(str, false);
      }
    }
    return profiles;

  },

  get sourceHomePageURL()
  {
    return "";
  },

  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIBrowserProfileMigrator
  ]),

  classDescription: "Qihu360se Profile Migrator",
  contractID: "@mozilla.org/profile/migrator;1?app=browser&type=360se",
  classID: Components.ID("{e3a19376-354b-49dd-a730-9a018fe1137d}")
};

const NSGetFactory = XPCOMUtils.generateNSGetFactory([ns360seMigrator]);
