import { useState } from 'react';
import { content, examplesFor, firstEn, searchContent, vocabIn } from '../content';
import { keyOf } from '../engine/exercises';
import { isIntroduced, unmetPrereqs } from '../engine/recommend';
import { strength } from '../engine/srs';
import { review, useAppState } from '../store/state';
import { startLearn, startPractice } from './actions';
import { Button, Card, Dot, H1, H2, List, Muted, Reo, Row, StatusBadge, STRENGTH_LABEL } from './components';
import { go } from './router';

const enc = encodeURIComponent;
const Back = ({ to, label }: { to: string; label: string }) => <a href={`#${to}`} className="mb-3 inline-block text-sm font-semibold text-accent">‹ {label}</a>;

export function Explore() {
  const { cards, kv } = useAppState();
  const kinds = [
    { kind: 'whakatauki', title: 'Whakataukī', empty: '' },
    { kind: 'karakia', title: 'Karakia', empty: 'No karakia are loaded. Karakia differ in purpose and are not interchangeable, so none are included until one can be properly sourced and checked. The app supports them: see “Adding content” in the README.' },
    { kind: 'pepeha', title: 'Pepeha', empty: '' },
  ] as const;
  const [q, setQ] = useState('');
  const found = searchContent(q);
  const search = (
    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search words, Māori or English" aria-label="Search words"
      autoCapitalize="none" autoCorrect="off" spellCheck={false} className="mt-3 w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent" />
  );
  if (q.trim()) return (
    <div>
      <H1>Explore</H1>
      {search}
      <Muted className="mt-2">Macrons are optional when searching.</Muted>
      {found.vocab.length + found.patterns.length === 0 && <Card className="mt-4"><Muted>Nothing matches “{q.trim()}”. This app has {content.vocab.length} words so far.</Muted></Card>}
      {found.vocab.length > 0 && <><H2>Words</H2><List>{found.vocab.map((v) => <Row key={v.id} lang="mi" title={v.mi} sub={<span lang="en">{v.en.slice(0, 3).join('; ')}</span>} right={<Dot s={strength(cards[keyOf(v.id, 'recognise')])} />} onClick={() => go(`/explore/item/${enc(v.id)}`)} />)}</List></>}
      {found.patterns.length > 0 && <><H2>Sentence patterns</H2><List>{found.patterns.map((p) => <Row key={p.id} lang="mi" title={p.title} sub={`Level ${p.level}`} onClick={() => go(`/explore/item/${enc(p.id)}`)} />)}</List></>}
    </div>
  );
  return (
    <div>
      <H1>Explore</H1>
      <Muted>Everything is open. Start anywhere.</Muted>
      {search}
      <H2>Vocabulary</H2>
      <List>
        {content.topics.map((t) => {
          const items = content.vocab.filter((v) => v.topic === t.id);
          return <Row key={t.id} title={t.title} sub={`${items.filter((v) => isIntroduced(v.id, cards)).length} of ${items.length} started`} onClick={() => go(`/explore/topic/${enc(t.id)}`)} />;
        })}
      </List>
      <H2>Grammar and sentence patterns</H2>
      <List>
        {content.patterns.map((p) => <Row key={p.id} lang="mi" title={p.title} sub={`Level ${p.level}`} right={<Dot s={strength(cards[keyOf(p.id, 'apply')] ?? cards[keyOf(p.id, 'understand')])} />} onClick={() => go(`/explore/item/${enc(p.id)}`)} />)}
      </List>
      {kinds.map((k) => {
        const items = content.deep.filter((d) => d.kind === k.kind);
        return (
          <div key={k.kind}>
            <H2>{k.title}</H2>
            {items.length ? <List>{items.map((d) => <Row key={d.id} lang="mi" title={d.title} sub={kv.deep[d.id] ? 'In progress' : 'Not started'} onClick={() => go(`/deep/${enc(d.id)}`)} />)}</List> : <Card><Muted>{k.empty}</Muted></Card>}
          </div>
        );
      })}
    </div>
  );
}

export function TopicPage({ id }: { id: string }) {
  const { cards } = useAppState();
  const topic = content.topics.find((t) => t.id === id);
  const items = content.vocab.filter((v) => v.topic === id);
  if (!topic) return <Back to="/explore" label="Explore" />;
  const fresh = items.filter((v) => !isIntroduced(v.id, cards));
  const back = `/explore/topic/${enc(id)}`;
  return (
    <div>
      <Back to="/explore" label="Explore" />
      <H1>{topic.title}</H1>
      <div className="flex gap-2">
        {fresh.length > 0 && <Button className="flex-1" onClick={() => startLearn({ within: items.map((v) => v.id), back })}>Learn new</Button>}
        {fresh.length > 0 && <Button variant="secondary" onClick={() => startLearn({ within: items.map((v) => v.id), testOut: true, back })}>Test out</Button>}
        {fresh.length < items.length && <Button variant="secondary" className={fresh.length ? '' : 'flex-1'} onClick={() => startPractice(items.map((v) => v.id), back)}>Practise</Button>}
      </div>
      <div className="mt-4">
        <List>
          {items.map((v) => (
            <Row key={v.id} lang="mi" title={v.mi} sub={<span lang="en">{v.en.slice(0, 3).join('; ')}</span>}
              right={<span className="flex items-center gap-1"><span className="text-xs text-muted">L{v.level}</span><Dot s={strength(cards[keyOf(v.id, 'recognise')])} /><Dot s={strength(cards[keyOf(v.id, 'produce')])} /></span>}
              onClick={() => go(`/explore/item/${enc(v.id)}`)} />
          ))}
        </List>
        <Muted className="mt-2">Dots: recognising the word, then producing it.</Muted>
      </div>
    </div>
  );
}

function SkillLine({ label, cardKey }: { label: string; cardKey: string }) {
  const { cards } = useAppState();
  const c = cards[cardKey];
  const s = strength(c);
  return <p className="flex items-center gap-2 py-1"><Dot s={s} /><span className="flex-1">{label}</span><span className="text-sm text-muted">{STRENGTH_LABEL[s]}{c && c.state === 'review' ? ` · next ${new Date(c.due).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}` : ''}</span></p>;
}

export function ItemPage({ id }: { id: string }) {
  const { cards } = useAppState();
  const v = content.vocabById.get(id);
  const p = content.patternById.get(id);
  const back = `/explore/item/${enc(id)}`;
  const markKnown = (skills: readonly ('recognise' | 'produce' | 'understand' | 'apply')[]) => skills.forEach((s) => review(keyOf(id, s), 'easy', 'skipped'));

  if (v) {
    const topic = content.topics.find((t) => t.id === v.topic)!;
    const ex = examplesFor(v, 3);
    const inDeep = content.deep.filter((d) => vocabIn(d.lines.map((l) => l.mi).join(' ')).some((x) => x.id === v.id));
    const started = isIntroduced(v.id, cards);
    return (
      <div>
        <Back to={`/explore/topic/${enc(topic.id)}`} label={topic.title} />
        <p lang="mi" className="reo text-4xl font-bold">{v.mi}</p>
        {v.altMi.length > 0 && <p className="mt-1 text-muted">also: <Reo>{v.altMi.join(', ')}</Reo></p>}
        <p className="mt-3 text-xl">{v.en.join('; ')}</p>
        {v.note && <Muted className="mt-2">{v.note}</Muted>}
        <div className="mt-3"><StatusBadge status={v.status} source={v.source} /></div>
        {ex.length > 0 && <><H2>In sentences</H2><Card className="space-y-2">{ex.map((e) => <p key={e.mi}><Reo className="font-semibold">{e.mi}</Reo><br /><span className="text-sm text-muted">{e.en}</span></p>)}</Card></>}
        {inDeep.length > 0 && <><H2>Appears in</H2><List>{inDeep.map((d) => <Row key={d.id} lang="mi" title={d.title} onClick={() => go(`/deep/${enc(d.id)}`)} />)}</List></>}
        <H2>Your progress</H2>
        <Card><SkillLine label="Recognise" cardKey={keyOf(v.id, 'recognise')} /><SkillLine label="Produce" cardKey={keyOf(v.id, 'produce')} /></Card>
        <div className="mt-4 flex gap-2">
          {started ? <Button className="flex-1" onClick={() => startPractice([v.id], back)}>Practise</Button> : <Button className="flex-1" onClick={() => startLearn({ within: [v.id], back })}>Learn</Button>}
          {!started && <Button variant="secondary" onClick={() => markKnown(['recognise', 'produce'])}>I know this</Button>}
        </div>
      </div>
    );
  }
  if (p) {
    const pre = unmetPrereqs(p.id, content, cards);
    const started = isIntroduced(p.id, cards);
    const usedIn = content.deep.filter((d) => d.components.some((c) => c.pattern === p.id));
    return (
      <div>
        <Back to="/explore" label="Explore" />
        <h1 lang="mi" className="reo text-2xl font-bold">{p.title}</h1>
        <p lang="mi" className="reo mt-3 rounded-xl bg-accent-soft p-3 font-medium">{p.structure}</p>
        <p className="mt-3 leading-relaxed"><Reo>{p.explanation}</Reo></p>
        <div className="mt-3"><StatusBadge status={p.status} source={p.source} /></div>
        {pre.length > 0 && <Muted className="mt-3">Usually learned after: {pre.map((x) => content.patternById.get(x)!.title).join('; ')}. This is advice only.</Muted>}
        <H2>Examples</H2>
        <Card className="space-y-2">{p.sentences.map((s) => <p key={s.id}><Reo className="font-semibold">{s.mi}</Reo><br /><span className="text-sm text-muted">{firstEn(s.en)}</span></p>)}</Card>
        {usedIn.length > 0 && <><H2>Used in</H2><List>{usedIn.map((d) => <Row key={d.id} lang="mi" title={d.title} onClick={() => go(`/deep/${enc(d.id)}`)} />)}</List></>}
        <H2>Your progress</H2>
        <Card><SkillLine label="Understand" cardKey={keyOf(p.id, 'understand')} /><SkillLine label="Apply (build and transform)" cardKey={keyOf(p.id, 'apply')} /></Card>
        <div className="mt-4 flex gap-2">
          {started ? <Button className="flex-1" onClick={() => startPractice([p.id], back)}>Practise</Button> : <Button className="flex-1" onClick={() => startLearn({ within: [p.id], back })}>Learn</Button>}
          {!started && <Button variant="secondary" onClick={() => startLearn({ within: [p.id], testOut: true, back })}>Test out</Button>}
        </div>
      </div>
    );
  }
  return <Back to="/explore" label="Explore" />;
}
