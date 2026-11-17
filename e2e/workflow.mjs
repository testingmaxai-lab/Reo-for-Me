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

// a fake microphone lets the voice recorder be exercised for real
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true, permissions: ['microphone'] });
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
assert.match(before, new RegExp(`\\d+ of ${vocab.length} started`));
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
await page.getByTestId('new-count').waitFor();
assert.match(await page.locator('main').innerText(), /New: .*(mea|ao)/);
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
await page.getByText(`0 of ${vocab.length} started`).first().waitFor();
await page.getByLabel('Backup file to import').setInputFiles(file);
await page.getByText(`Restored ${backup.cards.length} learning records.`).waitFor();
assert.equal((await progressText(page)).split('BACKUP')[0], beforeReset.split('BACKUP')[0]);
fs.writeFileSync(path.join(out, 'bad.json'), '{"format":"nope"}');
await page.getByLabel('Backup file to import').setInputFiles(path.join(out, 'bad.json'));
await page.getByText('This is not a progress backup from this app.').waitFor();
step('export -> reset -> import restores everything; an invalid file is rejected');

// Hear yourself: record twice, compare, delete
await page.goto(URL0 + '#/explore/item/' + encodeURIComponent('v:kia-ora'));
const voice = page.getByRole('region', { name: 'Hear yourself' });
for (let n = 1; n <= 2; n++) {
  await voice.getByRole('button', { name: 'Record', exact: true }).click();
  await voice.getByRole('button', { name: 'Stop recording' }).waitFor();
  await page.waitForTimeout(700);
  await voice.getByRole('button', { name: 'Stop recording' }).click();
  await voice.getByRole('listitem').nth(n - 1).waitFor();
}
await voice.getByRole('button', { name: 'Compare: earliest, then latest' }).click();
await voice.getByRole('button', { name: /^Stop recording from/ }).first().waitFor(); // it is playing
await shot(page, '18-voice');
await noOverflow(page, 'voice');
await page.reload();
await voice.getByRole('listitem').nth(1).waitFor(); // recordings survive a reopen
await voice.getByRole('button', { name: /^Delete recording/ }).first().click();
await voice.getByRole('listitem').nth(1).waitFor({ state: 'detached' });
assert.equal(await voice.getByRole('listitem').count(), 1);
assert.ok(!fs.readFileSync(file, 'utf8').includes('audio'), 'recordings must not be in backups');
step('voice: recorded twice, compared, survived a reopen, deleted one');

// Report a problem from a question, then the content check
await page.getByRole('button', { name: 'Practise' }).click();
await page.getByRole('button', { name: 'Don’t know' }).click();
await page.getByRole('button', { name: 'Report a problem with this question' }).click();
await page.getByRole('radio', { name: 'The expected answer looks wrong' }).click();
await page.getByLabel('Note about the problem').fill('testing');
await page.keyboard.press('Enter'); // must not skip on to the next question
await page.getByRole('button', { name: 'Save report' }).click();
await page.getByText('Saved. It will be included').waitFor();
await page.getByRole('button', { name: 'End session' }).click();
await page.goto(URL0 + '#/check');
await page.getByTestId('check-summary').waitFor();
const total = vocab.length + patterns.length + sentences.length + transforms.length + deep.length;
assert.match(await page.getByTestId('check-summary').innerText(), new RegExp(`^0 of ${total} checked`));
await shot(page, '19-check');
await noOverflow(page, 'check');
await page.getByRole('button', { name: 'Correct', exact: true }).click();
await page.getByLabel('Note').fill('Tēnā koe is more formal');
await page.getByRole('button', { name: 'Needs fixing' }).first().click();
assert.match(await page.getByTestId('check-summary').innerText(), /^2 of \d+ checked · 1 need fixing/);
await page.goto(URL0 + '#/progress');
await page.getByText('1 problem report from your own sessions.').waitFor();
const [fb] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export feedback' }).click()]);
const fbFile = path.join(out, 'feedback.json');
await fb.saveAs(fbFile);
const feedback = JSON.parse(fs.readFileSync(fbFile, 'utf8'));
assert.equal(feedback.checked.length, 2);
assert.equal(feedback.checked[1].note, 'Tēnā koe is more formal');
assert.equal(feedback.reports[0].note, 'testing');
// a marked item shows its local status to the learner
await page.goto(URL0 + '#/explore/item/' + encodeURIComponent('v:kia-ora'));
await page.getByText('Marked correct in the content check on this device.').waitFor();
// feedback from another device can be merged in
feedback.checked.push({ id: 'v:āe', verdict: 'ok', note: '', checkedAt: Date.now() });
fs.writeFileSync(fbFile, JSON.stringify(feedback));
await page.goto(URL0 + '#/progress');
await page.getByLabel('Feedback file to import').setInputFiles(fbFile);
await page.getByText('Added 3 checked items and 1 reports.').waitFor();
assert.match(await page.getByTestId('check-progress').innerText(), /^3 of/);
step('problem report saved; content check marks items, exports and merges feedback');

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

// Spaced review: six days later, learned items are due and reviewing them clears the queue
await page.close();
page = await ctx.newPage(); watch(page);
await page.clock.install({ time: Date.now() + 6 * 86400000 });
await page.goto(URL0);
await page.getByTestId('due-count').waitFor();
const due = Number(await page.getByTestId('due-count').innerText());
assert.ok(due >= 10, `expected reviews due, got ${due}`);
await shot(page, '12-home-reviews-due');
await page.getByRole('button', { name: 'Review only' }).click();
for (let guard = 0; guard < 120; guard++) { if (await page.getByText('session complete').count()) break; await answer(page, 'right'); }
await page.getByText('session complete').waitFor();
await page.goto(URL0 + '#/review');
await page.getByRole('heading', { name: 'Review' }).waitFor();
const left = await page.getByText('due now').count() ? Number(await page.locator('main p').first().innerText()) : 0;
assert.ok(left < due, 'reviewing should reduce what is due');
await page.getByRole('heading', { name: 'Trouble list' }).waitFor();
await page.getByText('Your mistake patterns').waitFor();
if (left > 0) {
  await page.getByRole('radio', { name: 'Sentences' }).click();
  const focused = Number(await page.getByTestId('review-due').innerText());
  assert.ok(focused <= left, 'a focus can only narrow what is due');
  await page.getByRole('radio', { name: 'Everything' }).click();
}
await shot(page, '13-review');
await noOverflow(page, 'review');
step(`six days later: ${due} reviews due, ${left} left after one review session`);

// One-tap daily session mixes what is due with new material
await page.goto(URL0);
await page.getByRole('button', { name: 'Start today’s session' }).click();
await page.getByTestId('exercise').or(page.getByRole('button', { name: 'Test me' })).first().waitFor();
await page.getByRole('button', { name: 'End session' }).click();
step('one-tap daily session starts');

// Search, hint, appearance
await page.goto(URL0 + '#/explore');
await page.getByLabel('Search words').fill('kuri');
await page.getByRole('button', { name: /kurī/ }).waitFor();
await page.getByLabel('Search words').fill('thank');
await page.getByRole('button', { name: /kia ora/ }).first().click();
await page.getByRole('button', { name: 'Practise' }).click();
await answer(page, 'right');
await page.getByRole('button', { name: 'Hint' }).click();
assert.equal(await page.getByTestId('hint').innerText(), 'Hint: kia … (2 words)');
await page.getByLabel('Your answer').fill('kia ora');
await page.keyboard.press('Enter');
await page.getByText('Hint used').waitFor();
await shot(page, '15-hint');
await page.keyboard.press('Enter');
step('search finds words without macrons and by English; a hint downgrades the answer');
await page.goto(URL0 + '#/progress');
await page.getByRole('radio', { name: 'Dark' }).click();
assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
await page.getByText('Reviews coming up').waitFor();
await shot(page, '16-progress-dark');
await noOverflow(page, 'progress dark');
await page.goto(URL0);
await page.getByTestId('due-count').waitFor();
await shot(page, '17-home-dark');
await page.reload();
await page.getByTestId('due-count').waitFor();
assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
step('dark appearance applies and persists');

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
