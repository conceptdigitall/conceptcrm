import { describe, expect, it } from 'vitest';
import { hasEnoughExamples, predictHead, selectHead, softmax, type TrainingSet } from './head';

// Two well-separated clouds in 16 dimensions, deterministic.
function clouds(perClass: number, labels = ['sim', 'não']): TrainingSet {
  let s = 7;
  const noise = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31 - 0.5) * 0.6;
  const vectors: number[][] = [];
  const y: number[] = [];
  labels.forEach((_, c) => {
    for (let i = 0; i < perClass; i++) {
      vectors.push(Array.from({ length: 16 }, (_, j) => (j % labels.length === c ? 1 : -1) + noise()));
      y.push(c);
    }
  });
  return {
    vectors, y, labels,
    baseCorrect: y.map((_, i) => i % 2 === 0), // the base model gets half right
    sampleWeight: y.map(() => 1),
  };
}

describe('softmax', () => {
  it('sums to 1 and keeps the order', () => {
    const p = softmax([1, 3, 2]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(p.indexOf(Math.max(...p))).toBe(1);
  });
});

describe('hasEnoughExamples', () => {
  it('needs 12 examples and two classes with 3 each', () => {
    expect(hasEnoughExamples(new Array(11).fill(0).map((_, i) => i % 2), 2)).toBe(false);
    expect(hasEnoughExamples([...new Array(10).fill(0), 1, 1], 2)).toBe(false);
    expect(hasEnoughExamples([...new Array(9).fill(0), 1, 1, 1], 2)).toBe(true);
  });
});

describe('selectHead', () => {
  it('adopts a head that beats the base model and predicts unseen vectors', () => {
    const set = clouds(12);
    const result = selectHead(set);
    expect(result).not.toBeNull();
    expect(result!.stats.accuracy).toBeGreaterThanOrEqual(0.85);
    expect(result!.stats.accuracy).toBeGreaterThan(result!.stats.baseAccuracy);
    const yes = predictHead(result!.model, new Array(16).fill(0).map((_, j) => (j % 2 === 0 ? 1 : -1)));
    const no = predictHead(result!.model, new Array(16).fill(0).map((_, j) => (j % 2 === 1 ? 1 : -1)));
    expect(yes.label).toBe('sim');
    expect(no.label).toBe('não');
    expect(yes.confidence).toBeGreaterThanOrEqual(result!.model.threshold);
  });

  it('handles three labels', () => {
    const result = selectHead(clouds(8, ['baixo', 'médio', 'alto']));
    expect(result?.model.labels).toEqual(['baixo', 'médio', 'alto']);
    expect(result?.model.weights).toHaveLength(3);
  });

  it('keeps no head when the base model is already right everywhere', () => {
    const set = { ...clouds(12), baseCorrect: new Array(24).fill(true) };
    expect(selectHead(set)).toBeNull();
  });

  it('keeps no head with too few examples', () => {
    expect(selectHead(clouds(4))).toBeNull();
  });

  it('is deterministic', () => {
    const a = selectHead(clouds(12));
    const b = selectHead(clouds(12));
    expect(a?.stats).toEqual(b?.stats);
  });
});
