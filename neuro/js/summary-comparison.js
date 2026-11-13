import { esc } from './util.js?v=1.4.2';

export const SUMMARY_AVERAGE = 61;
export function comparisonMarkup(records) {
  const exerciseIds = ['sch_f', 'sch_r', 'dob', 'mem'];
  const scores = exerciseIds.map(id => records.find(row => row.ex === id)?.score);
  if (scores.some(score => !Number.isFinite(score))) return '';
  const total = scores.reduce((sum, score) => sum + score, 0);
  const scale = Math.max(total, SUMMARY_AVERAGE) * 1.12;
  const above = total > SUMMARY_AVERAGE;
  const equal = total === SUMMARY_AVERAGE;
  const title = above ? 'Ваш результат выше среднего!' : equal ? 'Ваш результат на уровне среднего' : 'Ваш результат ниже среднестатистического';
  const message = above ? 'Улучшайте его каждый день!' : equal ? 'Продолжайте тренироваться и отслеживайте свой прогресс.' : 'Хотите улучшить? Тренируйте эти упражнения каждый день, чтобы развить гибкость мышления.';
  return `<section class="summary-comparison glass" aria-label="Сравнение суммы результатов с ориентиром 61">
    <h3>${title}</h3><p>${message}</p>
    <div class="comparison-chart" role="img" aria-label="Ваш результат ${total} баллов. Средний результат тестов ${SUMMARY_AVERAGE} балл.">
      ${[['Ваш результат', total, 'you'], ['Средний результат тестов', SUMMARY_AVERAGE, 'average']].map(([label,value,kind]) => `<div class="comparison-row"><div class="comparison-label"><span>${esc(label)}</span><b>${value}</b></div><div class="comparison-track"><i class="comparison-bar comparison-bar--${kind}" style="width:${value / scale * 100}%"></i></div></div>`).join('')}
    </div><small>Сумма баллов четырёх упражнений. Ориентир для сравнения — 61.</small>
  </section>`;
}

