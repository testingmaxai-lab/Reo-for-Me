# Reo

A personal te reo Māori learning app: teach briefly, test rigorously, progress quickly, revisit intelligently.

It runs entirely in the browser, installs to an iPhone home screen, works offline, and needs no account, server or paid service.

## What it does

- **Today**: one tap on Home runs everything due, then the next new material.
- **Learn**: new words and sentence patterns are introduced briefly, then tested straight away (recognise, produce, build a sentence, transform a sentence).
- **Review**: spaced repetition. Each skill is scheduled separately, so failing a sentence does not undo what you know about a word.
- **Explore**: every topic, pattern, whakataukī and the pepeha module is open from the start. Nothing is locked. "Test out" skips the teaching.
- **Deep learning**: whakataukī and pepeha go through five stages (encounter, understand, reconstruct, full recall, long-term mastery) with mastery tracked on four dimensions.
- **Progress**: coarse, honest indicators, 14-day activity and a 7-day review forecast, plus export and import of all progress.
- **Search**: find any word in Explore by Māori (macrons optional) or English.
- **Feedback**: a wrong sentence shows which words were missing or different. A **Hint** gives the first word or letter; a correct answer after a hint counts as a near miss.
- **Appearance**: light, dark, or match the device (Progress → Appearance). Home shows the date in te reo.

Answers are checked against curated answer lists with explicit rules. No AI grades anything.

| Your answer | Result | Effect on schedule |
|---|---|---|
| Matches the main answer or a listed alternative | Correct | Interval grows |
| Right letters, wrong or missing macrons | Near miss | Interval grows only slightly |
| One-letter slip in a long word | Near miss | Interval grows only slightly |
| Anything else | Not quite | Comes back this session, interval shortened |

Double vowels (`kurii`) are accepted for macrons. `au`/`ahau` and `tūpuna`/`tīpuna` are interchangeable. A slip that produces a different real word (`māua` for `tāua`) is never forgiven. If you are marked wrong for a correct answer, tap **I was right**.

## Content and its status

| | Count | Status |
|---|---|---|
| Vocabulary | 369 words in 16 topics | Cross-checked |
| Sentence patterns | 19, with 123 sentences and 37 transformations | Cross-checked |
| Whakataukī | 6 | Cross-checked |
| Pepeha (for tauiwi) | 1 template you fill in | Draft |
| Karakia | 0 | Supported, deliberately empty |

**None of this has been reviewed by a fluent speaker.** "Cross-checked" means written by AI from standard references. "Verified" is reserved for items you or a fluent speaker have reviewed: change `"status"` in the content file once that happens. Every item shows its status and source in the app.

Things most worth a kaiako's eye: the pepeha acknowledgement line; the provenance and attribution notes on the whakataukī (Meri Ngāroto, Tā Hēmi Hēnare, Paterangi); the negation, a/o possession, counting and time-phrase patterns; and the work and te ao Māori vocabulary, where short English glosses are necessarily rough.

## Run it locally

Needs Node 20 or later.

```
npm install
npm run dev        # development server
npm test           # unit tests
npm run build      # production build in dist/
npm run e2e        # full workflow in a headless iPhone-sized browser (run build first; needs Playwright)
```

## Put it on your iPhone

1. **Deploy** (one-off). Merge this branch into `main`. In the GitHub repository go to Settings → Pages and set Source to **GitHub Actions**. The included workflow tests, builds and publishes on every push to `main`. On a free GitHub plan the repository must be public for Pages; the app contains no personal data. Any static host also works (Netlify, Cloudflare Pages): build command `npm run build`, publish directory `dist`.
2. **Install**. Open the site in **Safari** on the iPhone, tap Share, then **Add to Home Screen**. Open it from the home screen once while online so it can cache itself. After that it works offline.

Updates arrive automatically the next time you open the app online. Updating never touches your progress.

## Your data

Progress lives in this browser on this device (IndexedDB). Nothing is uploaded.

- It does **not** sync between phone and computer. To move it, export on one and import on the other.
- It is lost if you clear website data or delete the home-screen app. Safari can also clear data for sites that are not installed and not visited for some weeks.
- **Export regularly** from Progress → Backup, and save the file to Files or iCloud Drive. The app reminds you every two weeks.
- Import checks the file before replacing anything, and refuses files from a newer version of the app.

## Adding and editing content

All content is in the `content/` folder as plain JSON. You do not need to touch the code. After editing, run `npm test`: it checks the files for mistakes (duplicates, missing meanings, sentences that fail their own answer key, macron inconsistencies).

**A word** (`content/vocab.json`, inside the right topic):

```json
{ "mi": "pōtae", "en": ["hat"], "level": 2, "note": "Optional note." }
```

- `en` lists every acceptable English meaning. Text in brackets is a clarifier shown to you but not required: `"that (near you)"`.
- `altMi` lists other acceptable Māori answers.
- `selfCheck: true` makes recognition self-assessed, for meanings too nuanced to type.
- Do not change a word's `mi` once you have learned it, or its progress is orphaned. To correct a spelling, add `"id": "<old spelling>"`.

**A sentence** (`content/grammar.json`, inside a pattern):

```json
{ "mi": "Kei te oma te kurī.", "en": "The dog is (running|racing).", "hint": "optional clarifier" }
```

`(a|b)` accepts either wording. The same sentence is used for translating into English and for building in Māori. Example sentences for each word are found automatically.

**A transformation**: `{ "from": "…", "fromEn": "…", "instruction": "Make it negative.", "answers": ["…"] }`. Only add ones whose answers you are sure of.

**A whakataukī or karakia** (`content/deep.json`): copy an existing entry and set `"kind"`. Include `provenance`, `context`, `usage`, `components` and `structureQs`. Set `"status": "draft"` until it has been checked, and say plainly in `provenance` if the origin is not known. Do not add a karakia without a source and guidance on when it is appropriate.

**Interchangeable spellings**: `content/equivalents.json`.

## How it is built

React, TypeScript, Vite, Tailwind CSS, IndexedDB (via `idb`), and `vite-plugin-pwa` for offline support.

```
content/            learning content (JSON)
src/content/        loads, links and validates content
src/engine/         normalize (answer checking) · srs (scheduling) · exercises · session
                    recommend (pathway, diagnostic) · progress · deep
src/store/          IndexedDB, app state, backup format
src/ui/             screens
e2e/                end-to-end workflow script
```

The scheduler sits behind a small `Scheduler` interface (`src/engine/srs.ts`), so FSRS can replace it without touching anything else. It is SM-2 style: 1 day, 3 days, then roughly ×2.5; a lapse quarters the interval; "Too easy" and testing out jump ahead.

## Known limitations

- Content has not been reviewed by a fluent speaker.
- No audio. There is no licensed audio to bundle and iOS has no te reo Māori voice.
- Typed sentences are matched against listed answers, so a correct but unlisted wording is marked wrong. Use "I was right".
- No sync between devices.
- Meaning and context for whakataukī are self-assessed.
- Not yet tested on a physical iPhone, only in an emulated iPhone-sized browser.

## Sensible next steps

1. Have a kaiako review the content and mark items verified.
2. Add content: passives, more on numbers and telling the time, more whakataukī, a sourced karakia.
3. Licensed or self-recorded audio.
4. FSRS scheduling once there is enough review history.
5. Optional sync (for example a file in iCloud Drive).
