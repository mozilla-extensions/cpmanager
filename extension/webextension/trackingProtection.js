(async function() {
  try {
    let result = await browser.storage.local.get({
      trackingProtection: {
        disabledOnce: false
      }
    });
    if (result.trackingProtection.disabledOnce) {
      return;
    }
  } catch (ex) {
    console.error(ex);
  }

  let origVal = await browser.privacy.websites.trackingProtectionMode.get({});
  switch (origVal.levelOfControl) {
    case "not_controllable":
    case "controlled_by_other_extensions":
    case "controllable_by_this_extension":
      let modified = await browser.privacy.websites.trackingProtectionMode.set({
        value: "never"
      });
      if (!modified) {
        console.error(`Failed with levelOfControl: ${origVal.levelOfControl}`);
        break;
      }
      // intentionally no break when modified is true;
    case "controlled_by_this_extension":
      try {
        await browser.storage.local.set({
          trackingProtection: {
            disabledOnce: true
          }
        });
      } catch (ex) {
        console.error(ex);
      }
      break;
    default:
      console.error(`Unknown levelOfControl: ${origVal.levelOfControl}`);
      break;
  }
})();
