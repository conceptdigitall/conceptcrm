// A small classifier ("head") trained per AI column on top of Laya's frozen encoder.
// Multinomial logistic regression with l2, trained in its dual form: starting from
// zero, gradient descent keeps w = Xᵀα, so every step only needs the n×n Gram matrix
// (n ≤ 500 leads) instead of the 768-dim vectors. Same result, far fewer operations.

export interface HeadModel {
  labels: string[];
  /** k × d, applied to (x - mu) / sd. */
  weights: number[][];
  bias: number[];
  mu: number[];
  sd: number[];
  /** The head only decides when its top probability reaches this. */
  threshold: number;
}

export interface HeadStats {
  l2: number;
  threshold: number;
  /** Share of examples where the head is confident enough to decide (cross-validated). */
  coverage: number;
  /** Head accuracy on the examples it decides (cross-validated). */
  accuracy: number;
  /** Laya base accuracy on those same examples. */
  baseAccuracy: number;
}

export interface TrainingSet {
  vectors: number[][];
  /** Index into `labels`. */
  y: number[];
  labels: string[];
  /** Did Laya's base model get each example right? Null when unknown. */
  baseCorrect: (boolean | null)[];
  /** Training weight (João's corrections count more); evaluation weighs all equally. */
  sampleWeight: number[];
}

export const MIN_EXAMPLES = 12;
export const MIN_PER_CLASS = 3;
export const TARGET_ACCURACY = 0.85;
const L2_GRID = [0.1, 0.3, 1, 3];
const THRESHOLD_GRID = [0.6, 0.7, 0.8, 0.9];
const FOLDS = 5;
const REPEATS = 3;
const ITERATIONS = 400;

export function softmax(z: number[]): number[] {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

function standardize(X: number[][]): { Xs: number[][]; mu: number[]; sd: number[] } {
  const n = X.length;
  const d = X[0].length;
  const mu = new Array<number>(d).fill(0);
  const sd = new Array<number>(d).fill(0);
  for (const x of X) for (let j = 0; j < d; j++) mu[j] += x[j] / n;
  for (const x of X) for (let j = 0; j < d; j++) sd[j] += (x[j] - mu[j]) ** 2 / n;
  for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j]) + 1e-6;
  return { Xs: X.map((x) => x.map((v, j) => (v - mu[j]) / sd[j])), mu, sd };
}

function gram(Xs: number[][]): Float64Array[] {
  const n = Xs.length;
  const K = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      const a = Xs[i];
      const b = Xs[j];
      for (let t = 0; t < a.length; t++) s += a[t] * b[t];
      K[i][j] = s;
      K[j][i] = s;
    }
  }
  return K;
}

// Largest eigenvalue of K restricted to `idx` (power iteration): sets a safe step size.
function topEigen(K: Float64Array[], idx: number[]): number {
  let v = idx.map(() => 1 / Math.sqrt(idx.length));
  let lambda = 0;
  for (let it = 0; it < 30; it++) {
    const w = idx.map((i) => idx.reduce((s, j, b) => s + K[i][j] * v[b], 0));
    lambda = Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1;
    v = w.map((x) => x / lambda);
  }
  return lambda;
}

interface DualFit { alpha: number[][]; bias: number[]; idx: number[] }

// Weighted cross-entropy + l2·‖w‖², Nesterov-accelerated gradient descent in α.
function fitDual(K: Float64Array[], y: number[], k: number, idx: number[], l2: number, sw: number[]): DualFit {
  const n = idx.length;
  const counts = new Array<number>(k).fill(0);
  for (const i of idx) counts[y[i]] += 1;
  // Balanced classes (like the Python head): rare classes are not drowned out.
  const w = idx.map((i) => (n / (k * Math.max(1, counts[y[i]]))) * sw[i]);
  const wSum = w.reduce((a, b) => a + b, 0);
  const step = 1 / (topEigen(K, idx) / (2 * wSum) * Math.max(...w) + 2 * l2);

  let alpha = Array.from({ length: n }, () => new Array<number>(k).fill(0));
  let bias = new Array<number>(k).fill(0);
  let prevAlpha = alpha.map((r) => [...r]);
  let prevBias = [...bias];
  for (let it = 1; it <= ITERATIONS; it++) {
    const m = (it - 1) / (it + 2);
    const a = alpha.map((r, i) => r.map((v, c) => v + m * (v - prevAlpha[i][c])));
    const b = bias.map((v, c) => v + m * (v - prevBias[c]));
    const grad = Array.from({ length: n }, () => new Array<number>(k).fill(0));
    const gBias = new Array<number>(k).fill(0);
    for (let r = 0; r < n; r++) {
      const z = new Array<number>(k).fill(0);
      const Ki = K[idx[r]];
      for (let s = 0; s < n; s++) {
        const kv = Ki[idx[s]];
        if (kv === 0) continue;
        for (let c = 0; c < k; c++) z[c] += kv * a[s][c];
      }
      const p = softmax(z.map((v, c) => v + b[c]));
      for (let c = 0; c < k; c++) {
        const g = (w[r] * (p[c] - (y[idx[r]] === c ? 1 : 0))) / wSum;
        grad[r][c] = g;
        gBias[c] += g;
      }
    }
    prevAlpha = alpha;
    prevBias = bias;
    alpha = a.map((row, r) => row.map((v, c) => v - step * (grad[r][c] + 2 * l2 * v)));
    bias = b.map((v, c) => v - step * gBias[c]);
  }
  return { alpha, bias, idx };
}

function predictDual(K: Float64Array[], fit: DualFit, row: number): number[] {
  const k = fit.bias.length;
  const z = [...fit.bias];
  for (let s = 0; s < fit.idx.length; s++) {
    const kv = K[row][fit.idx[s]];
    for (let c = 0; c < k; c++) z[c] += kv * fit.alpha[s][c];
  }
  return softmax(z);
}

// Deterministic so a retrain on the same data picks the same head.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function stratifiedFolds(y: number[], k: number, random: () => number): number[] {
  const folds = new Array<number>(y.length).fill(0);
  for (let c = 0; c < k; c++) {
    const members = y.flatMap((v, i) => (v === c ? [i] : []));
    for (let i = members.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [members[i], members[j]] = [members[j], members[i]];
    }
    members.forEach((m, i) => { folds[m] = i % FOLDS; });
  }
  return folds;
}

/** Out-of-fold probabilities, REPEATS × n × k. */
function crossValidate(K: Float64Array[], set: TrainingSet, l2: number): number[][][] {
  const k = set.labels.length;
  const random = rng(42);
  const out: number[][][] = [];
  for (let r = 0; r < REPEATS; r++) {
    const folds = stratifiedFolds(set.y, k, random);
    const P: number[][] = new Array(set.y.length);
    for (let f = 0; f < FOLDS; f++) {
      const train = folds.flatMap((v, i) => (v !== f ? [i] : []));
      const test = folds.flatMap((v, i) => (v === f ? [i] : []));
      if (test.length === 0) continue;
      const fit = fitDual(K, set.y, k, train, l2, set.sampleWeight);
      for (const i of test) P[i] = predictDual(K, fit, i);
    }
    out.push(P);
  }
  return out;
}

export function hasEnoughExamples(y: number[], k: number): boolean {
  if (y.length < MIN_EXAMPLES) return false;
  const counts = new Array<number>(k).fill(0);
  for (const v of y) counts[v] += 1;
  return counts.filter((c) => c >= MIN_PER_CLASS).length >= 2;
}

/**
 * Tries every l2 × threshold and keeps the one that decides on the most examples while
 * (cross-validated) hitting TARGET_ACCURACY and beating Laya's base model on the same
 * examples. Returns null when nothing qualifies: then the column keeps Laya + Claude.
 */
export function selectHead(set: TrainingSet): { model: HeadModel; stats: HeadStats } | null {
  const k = set.labels.length;
  if (!hasEnoughExamples(set.y, k)) return null;
  const { Xs, mu, sd } = standardize(set.vectors);
  const K = gram(Xs);

  let best: HeadStats | null = null;
  for (const l2 of L2_GRID) {
    const runs = crossValidate(K, set, l2);
    for (const threshold of THRESHOLD_GRID) {
      let decided = 0;
      let right = 0;
      let baseRight = 0;
      for (const P of runs) {
        P.forEach((p, i) => {
          const top = Math.max(...p);
          if (top < threshold) return;
          decided += 1;
          if (p.indexOf(top) === set.y[i]) right += 1;
          if (set.baseCorrect[i] === true) baseRight += 1;
        });
      }
      if (decided === 0) continue;
      const stats = {
        l2, threshold,
        coverage: decided / (runs.length * set.y.length),
        accuracy: right / decided,
        baseAccuracy: baseRight / decided,
      };
      const qualifies = stats.accuracy >= TARGET_ACCURACY && stats.accuracy > stats.baseAccuracy;
      if (qualifies && (!best || stats.coverage > best.coverage)) best = stats;
    }
  }
  if (!best) return null;

  const all = set.y.map((_, i) => i);
  const fit = fitDual(K, set.y, k, all, best.l2, set.sampleWeight);
  // Back to primal weights: w_c = Σ_s α_sc · xs_s.
  const d = Xs[0].length;
  const weights = Array.from({ length: k }, () => new Array<number>(d).fill(0));
  fit.alpha.forEach((row, s) => {
    for (let c = 0; c < k; c++) {
      if (row[c] === 0) continue;
      for (let j = 0; j < d; j++) weights[c][j] += row[c] * Xs[s][j];
    }
  });
  return {
    model: { labels: set.labels, weights, bias: fit.bias, mu, sd, threshold: best.threshold },
    stats: best,
  };
}

export function predictHead(model: HeadModel, vector: number[]): { label: string; confidence: number } {
  const z = model.weights.map((w, c) => {
    let s = model.bias[c];
    for (let j = 0; j < w.length; j++) s += w[j] * ((vector[j] - model.mu[j]) / model.sd[j]);
    return s;
  });
  const p = softmax(z);
  const top = Math.max(...p);
  return { label: model.labels[p.indexOf(top)], confidence: Math.round(top * 1000) / 1000 };
}
