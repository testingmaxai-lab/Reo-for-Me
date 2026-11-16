/** Content schema. Content lives in /content/*.json and is independent of app logic. */
export type Status = 'verified' | 'cross-checked' | 'draft' | 'example';
export type Lang = 'mi' | 'en';
export interface Pair { mi: string; en: string }

export interface Topic { id: string; title: string; order: number }

export interface VocabItem {
  id: string;            // "v:<slug>"
  mi: string;
  altMi: string[];
  en: string[];          // acceptable English meanings; text in (brackets) is a clarifier
  topic: string;
  level: number;         // 1 = core … 3 = later
  note?: string;
  selfCheck?: boolean;   // recognition is self-assessed (meaning too nuanced to type)
  status: Status;
  source: string;
}

export interface Sentence { id: string; pattern: string; mi: string; en: string; hint?: string }
export interface Transform { id: string; pattern: string; from: string; fromEn: string; instruction: string; answers: string[]; explain?: string }

export interface Pattern {
  id: string;            // "p:<slug>"
  title: string;
  level: number;
  order: number;
  prereqs: string[];     // pattern ids; recommendations, never locks
  structure: string;
  explanation: string;
  sentences: Sentence[];
  transforms: Transform[];
  status: Status;
  source: string;
}

export type DeepKind = 'whakatauki' | 'karakia' | 'pepeha';
export interface DeepSlot { id: string; label: string; hint?: string; optional?: boolean }
export interface DeepComponent { mi: string; gloss: string; note?: string; pattern?: string }
export interface StructureQ { prompt: string; lang: Lang; answers: string[]; explain?: string }
export interface DeepItem {
  id: string;            // "d:<slug>"
  kind: DeepKind;
  title: string;
  lines: Pair[];         // may contain {slot} placeholders (pepeha)
  slots?: DeepSlot[];
  literal?: string;
  meaning: string;
  provenance: string;
  context: string;
  usage: string;
  nuances?: string;
  components: DeepComponent[];
  structureQs: StructureQ[];
  status: Status;
  source: string;
}

export interface Content {
  topics: Topic[];
  vocab: VocabItem[];
  patterns: Pattern[];
  deep: DeepItem[];
  equivalents: Record<string, string>;
  vocabById: Map<string, VocabItem>;
  patternById: Map<string, Pattern>;
  deepById: Map<string, DeepItem>;
  /** every Māori word that appears anywhere in the content (normalised) */
  lexicon: Set<string>;
  /** single-word vocab lookup by normalised Māori form */
  vocabByForm: Map<string, VocabItem>;
}

export const STATUS_LABEL: Record<Status, string> = {
  verified: 'Verified',
  'cross-checked': 'Cross-checked',
  draft: 'Draft — needs review',
  example: 'Illustrative example',
};
export const STATUS_HELP: Record<Status, string> = {
  verified: 'Reviewed by you or a fluent speaker.',
  'cross-checked': 'Written by AI from standard references. Not yet reviewed by a fluent speaker.',
  draft: 'Unreviewed. Treat with caution and confirm before relying on it.',
  example: 'Made up for testing. Not authoritative.',
};
