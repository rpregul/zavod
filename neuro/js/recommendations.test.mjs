import test from 'node:test';
import assert from 'node:assert/strict';
import { exerciseReport, recommendations, EXPERT_CUTOFFS } from './recommendations.js';
test('first result has no invented normal/low threshold', () => {
  for (const ex of Object.keys(EXPERT_CUTOFFS)) {
    assert.equal(EXPERT_CUTOFFS[ex], null);
    const report = exerciseReport(ex, { score: 2, ts: 10 }, []);
    assert.equal(report.label, 'Твоя точка отсчёта');
    assert.match(report.routine, /14 дней сравни/);
  }
});
test('relative feedback uses own earlier results, not other exercise scores', () => {
  const history = [1, 2, 3].map(ts => ({ ex: 'mem', score: 20, ts, day: String(ts) }));
  assert.match(exerciseReport('mem', { score: 10, ts: 4 }, history).label, /Ниже твоего/);
  assert.match(exerciseReport('mem', { score: 22, ts: 4 }, history).label, /обычном диапазоне/);
  assert.equal(exerciseReport('sch_f', { score: 1, ts: 4 }, history).label, 'Твоя точка отсчёта');
  assert.equal(recommendations(history).length, 2);
});
