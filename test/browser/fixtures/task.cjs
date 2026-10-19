const { basename, resolve } = require('node:path');
const { chromium } = require('./browser.cjs');

// A scenario that hasn't finished in this time fails by name instead of hanging the run.
const LIMIT_MS = Number(process.env.BROWSER_SCENARIO_LIMIT_MS || 5 * 60_000);

/**
 * Fails the process unless every registered scenario ran to completion, passed or failed. A scenario awaiting
 * something that never settles lets Node exit early with status 0, which would otherwise read as a pass.
 */
function requireEvery(task, scenarios, ran, running) {
  process.on('exit', () => {
    const missing = scenarios.filter(scenario => !ran.has(scenario.name)).map(scenario => scenario.name);
    if (!missing.length) return console.log(`${task}: ${ran.size} of ${scenarios.length} scenarios ran`);
    process.exitCode = 1;
    console.error(`${task}: ${ran.size} of ${scenarios.length} scenarios ran; did not run to completion: ${missing.join(', ')}`);
    if (running()) console.error(`${running()} was still waiting when the process ran out of work.`);
  });
}

/** One browser per task; fresh contexts, diagnostics and failures remain isolated per scenario. */
async function runTask(scenarios) {
  const root = resolve(process.argv[2] || 'web/dist'), task = basename(process.argv[1], '.cjs');
  const ran = new Set();
  let current;
  requireEvery(task, scenarios, ran, () => current);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    for (const scenario of scenarios) {
      console.log(`Scenario: ${scenario.name}`);
      current = scenario.name;
      let timer;
      try {
        await Promise.race([scenario(browser, root), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${scenario.name} did not finish within ${LIMIT_MS / 1000}s`)), LIMIT_MS); })]);
      }
      catch (error) { console.error(error); process.exitCode = 1; }
      finally { clearTimeout(timer); ran.add(scenario.name); current = undefined; for (const context of browser.contexts()) await context.close(); }
    }
  } finally { await browser.close(); }
}
/**
 * For a suite that runs its own browser loop: the same check that the whole body ran to completion, with a
 * suite-level time limit, so an await that never settles can't read as a pass.
 */
const SUITE_LIMIT_MS = Number(process.env.BROWSER_SUITE_LIMIT_MS || 15 * 60_000);
function runSuite(body) {
  const task = basename(process.argv[1], '.cjs'), ran = new Set();
  requireEvery(task, [{ name: task }], ran, () => undefined);
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(`${task} did not finish within ${SUITE_LIMIT_MS / 1000}s`), { limit: true })), SUITE_LIMIT_MS); });
  return Promise.race([body(), limit])
    .then(() => ran.add(task), error => {
      console.error(error); process.exitCode = 1;
      if (error?.limit) process.exit(1);
      ran.add(task);
    })
    .finally(() => clearTimeout(timer));
}
module.exports = { requireEvery, runSuite, runTask: scenarios => runTask(scenarios).catch(error => { console.error(error); process.exitCode = 1; }) };
