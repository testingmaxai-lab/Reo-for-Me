// End-to-end check of a realistic learning workflow at iPhone size, against the production build.
// Run: npm run build && npm run e2e
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'e2e/out');
fs.mkdirSync(out, { recursive: true });
const BASE = '/Reo-for-Max/'; // served under a sub-path, as on GitHub Pages
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!p.startsWith(BASE)) { res.writeHead(404).end(); return; }
  p = p.slice(BASE.length) || 'index.html';
  const f = path.join(root, 'dist', p);
  if (!f.startsWith(path.join(root, 'dist')) || !fs.existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }).end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const URL0 = `http://localhost:${server.address().port}${BASE}`;

// ---- answer key built from the content files --------------------------------
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'content', f), 'utf8'));
const first = (s) => { let t = s; while (/\([^()]*\|[^()]*\)/.test(t)) t = t.replace(/\(([^()|]*)\|[^()]*\)/, '$1'); return t.replace(/\s+/g, ' ').trim(); };
const vocab = read('vocab.json').topics.flatMap((t) => t.items);
const patterns = read('grammar.json').patterns;
const deep = read('deep.json').items;
const sentences = patterns.flatMap((p) => p.sentences);
const transforms = patterns.flatMap((p) => p.transforms);
const strip = (s) => s.normalize('NFD').replace(/̄/g, '').normalize('NFC');

function solve(instruction, prompt) {
  if (instruction === 'Type the English meaning') return vocab.find((v) => v.mi === prompt).en[0];
  if (instruction === 'Type the Māori') return vocab.find((v) => v.en.slice(0, 3).join('; ') === prompt).mi;
  if (instruction === 'Translate into English') return first(sentences.find((s) => s.mi === prompt).en);
  if (instruction === 'Say it in Māori' || instruction === 'Build the sentence in Māori') return sentences.find((s) => first(s.en) === prompt).mi;
  const t = transforms.find((x) => x.instruction === instruction && x.from === prompt);
  if (t) return t.answers[0];
  for (const d of deep) {
    const text = d.lines.map((l) => l.mi).join(' ');
    const q = d.structureQs.find((x) => x.prompt === instruction);
    if (q && prompt === text) return first(q.answers[0]);
    if (instruction === 'Type the whole text from memory' && prompt === d.lines.map((l) => l.en).join(' ')) return text;
    if (instruction === 'Put it back in order' && prompt === d.lines.map((l) => l.en).join(' ')) return text;
    if (instruction === 'Fill in the missing word') {
      for (const l of d.lines) for (const w of l.mi.split(/\s+/)) {
        const bare = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
        if (bare && l.mi.split(/\s+/).some((x, i, arr) => arr.map((y, j) => (j === i ? y.replace(bare, '_____') : y)).join(' ') === prompt && x === w)) return bare;
      }
    }
  }
  throw new Error(`No answer known for: ${instruction} / ${prompt}`);
}

/** Answers the exercise on screen. how: 'right' | 'wrong' | 'macron'. Returns the verdict shown. */
async function answer(page, how = 'right') {
  const ex = page.getByTestId('exercise');
  await ex.waitFor();
  const mode = await ex.getAttribute('data-mode');
  const instruction = await page.getByTestId('instruction').innerText();
  const prompt = await page.getByTestId('prompt').innerText();
  if (mode === 'self') {
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: how === 'wrong' ? 'Didn’t know' : 'Knew it' }).click();
    return 'self';
  }
  if (how === 'wrong') await page.getByRole('button', { name: 'Don’t know' }).click();
  else {
    let a = solve(instruction, prompt);
    if (mode === 'tiles') {
      for (const w of a.replace(/[.,!?;:]/g, '').split(/\s+/)) {
        const lower = await page.getByRole('group', { name: 'Words to choose from' }).getByRole('button', { name: w.toLowerCase(), exact: true }).and(page.locator(':enabled')).count();
        await page.getByRole('group', { name: 'Words to choose from' }).getByRole('button', { name: lower ? w.toLowerCase() : w, exact: true }).and(page.locator(':enabled')).first().click();
      }
      await page.getByRole('button', { name: 'Check' }).click();
    } else {
      if (how === 'macron') a = strip(a);
      await page.getByLabel('Your answer').fill(a);
      await page.keyboard.press('Enter'); // keyboard-only flow
    }
  }
  const verdict = await page.getByTestId('feedback').getAttribute('data-verdict');
  if (mode === 'type' && how !== 'wrong') await page.keyboard.press('Enter'); else await page.getByRole('button', { name: 'Continue' }).click();
  return verdict;
}
const noOverflow = async (page, where) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `horizontal overflow on ${where}`);
const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') });
const step = (s) => console.log('✓', s);

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
const errors = [];
let page = await ctx.newPage();
const watch = (p) => { p.on('dialog', (d) => d.accept()); p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); };
watch(page);

// 1–2. New user takes the diagnostic and gets a starting point
await page.goto(URL0);
await page.getByText('Where should you start?').waitFor();
await shot(page, '01-home-new');
await page.getByRole('button', { name: 'Take the check' }).click();
for (let i = 0; i < 15; i++) await answer(page, i < 5 ? 'right' : 'wrong');
await page.getByText('Suggested start: Level 2').waitFor();
await shot(page, '02-diagnostic-result');
step('diagnostic: level 1 passed, level 2 not -> suggests Level 2');
// the learner can override the recommendation
await page.getByRole('radio', { name: 'Level 1' }).click();
assert.equal(await page.getByRole('radio', { name: 'Level 1' }).getAttribute('aria-checked'), 'true');
step('recommendation overridden to Level 1');

// 3–5. Learn new items; some right, one wrong, one macron slip
await page.getByRole('button', { name: 'Start learning' }).click();
let wrongDone = false, sawAgain = false, verdicts = [];
for (let guard = 0; guard < 80; guard++) {
  if (await page.getByText('session complete').count()) break;
  if (await page.getByRole('button', { name: 'Test me' }).count()) {
    if (guard === 0) { await shot(page, '03-intro'); await noOverflow(page, 'intro'); }
    await page.getByRole('button', { name: 'Test me' }).click();
    continue;
  }
  if (await page.getByText('Again', { exact: true }).count()) sawAgain = true;
  const how = !wrongDone ? 'wrong' : 'right';
  if (!wrongDone) { await page.getByTestId('exercise').waitFor(); await shot(page, '04-exercise'); await noOverflow(page, 'exercise'); }
  verdicts.push(await answer(page, how));
  if (!wrongDone) { wrongDone = true; }
}
await page.getByText('session complete').waitFor();
await shot(page, '05-session-complete');
assert.ok(sawAgain, 'the failed item should come back in the same session');
assert.ok(verdicts.includes('wrong') && verdicts.filter((v) => v === 'correct').length >= 5);
step(`learn session done (${verdicts.length} answers; failed item was re-presented)`);

// macron handling in the real UI: start another lesson and drop macrons once
await page.getByRole('button', { name: 'Learn more new material' }).click();
let macronSeen = false;
for (let guard = 0; guard < 80; guard++) {
  if (await page.getByText('session complete').count()) break;
  if (await page.getByRole('button', { name: 'Test me' }).count()) { await page.getByRole('button', { name: 'Test me' }).click(); continue; }
  const ex = page.getByTestId('exercise'); await ex.waitFor();
  const inst = await page.getByTestId('instruction').innerText();
  let how = 'right';
  if (!macronSeen && (await ex.getAttribute('data-mode')) === 'type' && inst === 'Type the Māori') {
    const a = solve(inst, await page.getByTestId('prompt').innerText());
    if (strip(a) !== a) how = 'macron';
  }
  const v = await answer(page, how);
  if (how === 'macron') { assert.equal(v, 'macron'); macronSeen = true; }
}
await page.getByText('session complete').waitFor();
step(`second lesson done${macronSeen ? '; a missing macron was flagged as a near miss' : ''}`);
await page.getByRole('button', { name: 'Done' }).click();

// 6–7. Close and reopen: progress intact
const progressText = async (p) => { await p.goto(URL0 + '#/progress'); await p.getByText('Words you recognise').waitFor(); return p.locator('main').innerText(); };
const before = await progressText(page);
await shot(page, '06-progress');
await noOverflow(page, 'progress');
assert.match(before, /\d+ of 165 started/);
await page.close();
page = await ctx.newPage(); watch(page);
const after = await progressText(page);
assert.equal(after.split('BACKUP')[0], before.split('BACKUP')[0]);
step('progress identical after closing and reopening');

// 8–10. Whakataukī: all stages, independent mastery
await page.goto(URL0 + '#/deep/' + encodeURIComponent('d:he-tangata'));
await page.getByRole('button', { name: /1\. Encounter/ }).click();
await page.getByText('Meri Ngāroto').waitFor();
await shot(page, '07-deep-encounter');
await noOverflow(page, 'deep encounter');
await page.getByRole('button', { name: 'Continue to Understand' }).click();
await page.getByText('Piece by piece').waitFor();
await shot(page, '08-deep-understand');
await page.getByRole('button', { name: /Add \d+ new word/ }).click();
await page.getByRole('button', { name: 'Check my understanding' }).click();
for (let i = 0; i < 4; i++) await answer(page, 'right');
await page.getByRole('button', { name: 'Continue' }).click();
await answer(page, 'wrong'); // a missed reconstruction item must come round again
for (let i = 0; i < 5; i++) await answer(page, 'right');
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByText('Type the whole text from memory').waitFor();
await shot(page, '09-deep-recall');
await answer(page, 'right');
await page.getByText('Wording and recall').waitFor();
await shot(page, '10-deep-mastery');
const m = await page.locator('main').innerText();
assert.match(m, /Wording and recall\s*learning/i);
assert.match(m, /Overall\s*learning/i);
await page.reload();
await page.getByText('Wording and recall').waitFor();
step('whakataukī: encounter -> understand -> reconstruct -> full recall; four dimensions tracked and persisted');
// words queued from the whakataukī are offered first
await page.goto(URL0);
assert.match(await page.locator('main').innerText(), /New learning[\s\S]*(mea|ao)/);
step('words from the whakataukī are queued as the next lesson');

// Export, reset, import
await page.goto(URL0 + '#/progress');
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export progress' }).click()]);
const file = path.join(out, 'backup.json');
await dl.saveAs(file);
const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
assert.equal(backup.format, 'reo-progress');
assert.ok(backup.cards.length > 10 && backup.kv.deep['d:he-tangata'].stage === 4);
const beforeReset = await progressText(page);
await page.getByRole('button', { name: 'Reset all progress' }).click();
await page.getByRole('button', { name: 'Delete everything' }).click();
await page.getByText('0 of 165 started').first().waitFor();
await page.getByLabel('Backup file to import').setInputFiles(file);
await page.getByText(`Restored ${backup.cards.length} learning records.`).waitFor();
assert.equal((await progressText(page)).split('BACKUP')[0], beforeReset.split('BACKUP')[0]);
fs.writeFileSync(path.join(out, 'bad.json'), '{"format":"nope"}');
await page.getByLabel('Backup file to import').setInputFiles(path.join(out, 'bad.json'));
await page.getByText('This is not a progress backup from this app.').waitFor();
step('export -> reset -> import restores everything; an invalid file is rejected');

// Offline
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.goto(URL0 + '#/explore');
await page.reload();
await page.getByText('Everything is open').waitFor();
await shot(page, '11-explore-offline');
await noOverflow(page, 'explore');
await page.goto(URL0 + '#/learn');
await page.getByRole('button', { name: /^Learn \d+ new$/ }).click();
await page.getByRole('button', { name: 'Test me' }).click();
await answer(page, 'right');
await ctx.setOffline(false);
step('offline: app loads from cache and a lesson runs with the network off');

// Spaced review: three days later, learned items are due and reviewing them clears the queue
await page.close();
page = await ctx.newPage(); watch(page);
await page.clock.install({ time: Date.now() + 3 * 86400000 });
await page.goto(URL0);
await page.getByText('Reviews due').waitFor();
const due = Number(await page.locator('section', { hasText: 'Reviews due' }).locator('p').nth(1).innerText());
assert.ok(due >= 10, `expected reviews due, got ${due}`);
await shot(page, '12-home-reviews-due');
await page.getByRole('button', { name: 'Start review' }).click();
for (let guard = 0; guard < 120; guard++) { if (await page.getByText('session complete').count()) break; await answer(page, 'right'); }
await page.getByText('session complete').waitFor();
await page.goto(URL0 + '#/review');
await page.getByRole('heading', { name: 'Review' }).waitFor();
const left = await page.getByText('due now').count() ? Number(await page.locator('main p').first().innerText()) : 0;
assert.ok(left < due, 'reviewing should reduce what is due');
await shot(page, '13-review');
step(`three days later: ${due} reviews due, ${left} left after one review session`);

// Desktop layout
const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const dp = await desk.newPage(); watch(dp);
await dp.goto(URL0 + '#/learn');
await dp.getByText('Pathway').waitFor();
await noOverflow(dp, 'desktop learn');
await dp.screenshot({ path: path.join(out, '14-desktop-learn.png') });
step('desktop layout renders');

await browser.close();
server.close();
assert.deepEqual(errors, [], 'console errors: ' + errors.join('\n'));
console.log('\nAll end-to-end checks passed.');
