const assert = require('node:assert/strict');

/**
 * An absence check that can't pass merely because the page hasn't rendered yet: the locator must be
 * hidden now and still hidden after the page has had time to settle.
 */
async function assertHidden(locator, message) {
  for (const settle of [0, 300]) {
    if (settle) await locator.page().waitForTimeout(settle);
    assert.equal(await locator.isVisible(), false, message);
  }
}

module.exports = { assertHidden };
