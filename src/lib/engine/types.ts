export type Lang = 'ru' | 'kk';
export type Localized = Record<Lang, string>;

/** One student's result on one curriculum topic. Scores are 0–100. */
export interface Row {
  studentId: string;
  classId: string;
  schoolId: string;
  textbook: string;
  topicId: string;
  score: number;
  /** Hours the class actually spent on the topic. */
  hours: number | null;
  /** Entry level measured before the course (0–100). */
  baseline: number | null;
}

export interface TopicMeta {
  id: string;
  name: Localized;
  order: number;
}

/** Known answers for the synthetic demo, used only to check the engine. */
export interface GroundTruth {
  /** textbook → topicId → effect in points, relative to the mean of all textbooks. */
  textbookTopic: Record<string, Record<string, number>>;
  /** textbook → overall effect in points, relative to the mean of all textbooks. */
  textbookOverall: Record<string, number>;
  /** topicId → points gained per unit of ln(hours). */
  slopes: Record<string, number>;
}

export interface Dataset {
  source: 'demo' | 'upload';
  title: Localized;
  rows: Row[];
  topics: TopicMeta[];
  truth?: GroundTruth;
}

export interface Settings {
  /** A student has mastered a topic at or above this score. */
  masteryThreshold: number;
}

export const DEFAULT_SETTINGS: Settings = { masteryThreshold: 60 };

export interface Cell {
  mean: number;
  n: number;
  /** Within-class variance of student scores. */
  variance: number;
  hours: number | null;
}

export interface ClassInfo {
  id: string;
  schoolId: string;
  textbook: string;
  n: number;
  baseline: number | null;
  /** Mean of topic means, so missing topics do not bias the class. */
  overall: number;
}

export interface Cube {
  topics: TopicMeta[];
  textbooks: string[];
  classes: ClassInfo[];
  /** classIndex → topicIndex → cell */
  cells: (Cell | null)[][];
  /** studentIndex → topicIndex → score (NaN when absent) */
  students: Float32Array[];
  /** studentIndex → entry score (NaN when absent) */
  studentBaselines: number[];
  nSchools: number;
  hasBaseline: boolean;
  hasHours: boolean;
}

export type Verdict = 'better' | 'equivalent' | 'uncertain' | 'insufficient';

export interface TextbookStat {
  name: string;
  nSchools: number;
  nClasses: number;
  nStudents: number;
  rawMean: number;
  baselineMean: number | null;
  adjMean: number;
  adjLow: number;
  adjHigh: number;
  rawRank: number;
  adjRank: number;
}

export interface TextbookPair {
  a: string;
  b: string;
  /** a minus b, in points, adjusted for entry level. */
  diff: number;
  low: number;
  high: number;
  p: number;
  /** Standardised effect (Hedges' g). */
  g: number;
  verdict: Verdict;
}

export interface TopicBookCell {
  textbook: string;
  topicId: string;
  /** Points above (+) or below (−) the mean of all textbooks on this topic. */
  effect: number;
  low: number;
  high: number;
  p: number;
  q: number;
  significant: boolean;
}

export interface TextbookResult {
  adjusted: boolean;
  stats: TextbookStat[];
  pairs: TextbookPair[];
  cells: TopicBookCell[];
  rawLeader: string | null;
  adjLeader: string | null;
  reversal: boolean;
  /** Share of textbook pairs whose baseline ranges overlap enough to compare. */
  poorOverlap: string[];
}

export interface Edge {
  from: string;
  to: string;
  /** Partial correlation controlling for the student's other topics. */
  r: number;
  /** Points of the later topic per point of the earlier one. */
  rho: number;
  /** Mastery of `to` among those who mastered `from`. */
  masteredIf: number;
  /** Mastery of `to` among those who did not. */
  masteredIfNot: number;
}

export interface TopicSlope {
  topicId: string;
  raw: number;
  rawSe: number;
  /** Partially pooled slope: points per unit of ln(hours). */
  slope: number;
  se: number;
  low: number;
  high: number;
  /** Points expected from 30% more hours. */
  gainAt30: number;
  responsive: boolean;
  noEffect: boolean;
}

export type Level = 'critical' | 'hard' | 'ok' | 'easy';

export type Diagnosis =
  | { kind: 'cascade'; rootId: string; r: number; masteredIf: number; masteredIfNot: number }
  | { kind: 'textbook'; best: string; worst: string; gap: number }
  | { kind: 'hours'; gainAt30: number }
  | { kind: 'teaching'; spread: number; bestClass: number; worstClass: number }
  | { kind: 'program' };

export interface TopicResult {
  id: string;
  order: number;
  name: Localized;
  n: number;
  mean: number;
  low: number;
  high: number;
  masteredRate: number;
  /** Points below (−) or above (+) the same students' average on other topics. */
  relative: number;
  /** Class-to-class spread that sampling noise does not explain. */
  spread: number;
  classMin: number;
  classMax: number;
  /** Student counts in ten 10-point bins. */
  histogram: number[];
  level: Level;
  diagnosis: Diagnosis | null;
  predecessors: Edge[];
  successors: Edge[];
  slope: TopicSlope | null;
  currentHours: number | null;
  /** Observed class points: hours vs class-adjusted score. */
  dose: { hours: number; score: number }[];
}

export type Objective = 'average' | 'gaps';

export interface PlanOptions {
  objective: Objective;
  extraHours: number;
  maxShift: number;
}

export const DEFAULT_PLAN: PlanOptions = { objective: 'gaps', extraHours: 0, maxShift: 0.3 };

export interface HoursModel {
  topicIds: string[];
  current: number[];
  lo: number[];
  hi: number[];
  means: number[];
  slopes: TopicSlope[];
  edges: { from: number; to: number; rho: number }[];
  observedMin: number[];
  observedMax: number[];
  target: number;
}

export interface Forecast {
  after: number[];
  direct: number[];
  meanBefore: number;
  meanAfter: number;
  gain: number;
  gainLow: number;
  gainHigh: number;
  /** Mean change across topics currently below the mastery threshold. */
  weakGain: number;
}

export interface PlanRow {
  topicId: string;
  current: number;
  recommended: number;
  delta: number;
  before: number;
  after: number;
  low: number;
  high: number;
  reason: 'add_responsive' | 'add_root' | 'cut_saturated' | 'cut_strong' | 'keep_no_effect' | 'keep';
}

export interface Plan {
  options: PlanOptions;
  total: number;
  rows: PlanRow[];
  recommended: number[];
  forecast: Forecast;
}

export type Decision =
  | { kind: 'textbook'; best: string; other: string; diff: number; low: number; high: number; g: number; reversal: boolean; rawLeader: string | null; adjusted: boolean }
  | { kind: 'textbook_none'; adjusted: boolean }
  | { kind: 'root'; rootId: string; targets: string[]; masteredIf: number; masteredIfNot: number }
  | { kind: 'hours'; add: string[]; cut: string[]; moved: number; gain: number; low: number; high: number; weakGain: number }
  | { kind: 'no_hours'; topicIds: string[] };

export interface Validation {
  bookTopicR: number;
  bookOverallError: number;
  slopeR: number;
  coverage: number;
}

export interface Analysis {
  title: Localized;
  source: Dataset['source'];
  settings: Settings;
  nRows: number;
  nStudents: number;
  nClasses: number;
  nSchools: number;
  hasBaseline: boolean;
  hasHours: boolean;
  overallMean: number;
  textbooks: TextbookResult;
  topics: TopicResult[];
  edges: Edge[];
  model: HoursModel | null;
  plan: Plan | null;
  decisions: Decision[];
  validation: Validation | null;
}
