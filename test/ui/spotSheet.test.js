import { test, expect } from 'vitest';
import { renderSpotSheet } from '../../src/ui/spotSheet.js';
import { SPOTS } from '../../src/data/spots/index.js';

const rows = [{ spot: SPOTS.xiaoliuqiu, km: 0.4 }, { spot: SPOTS.kenting, km: 60.6 }];

test('current spot is ticked, the spot you are at says 你在這裡', () => {
  const html = renderSpotSheet({ rows, currentId: 'xiaoliuqiu', nearId: 'xiaoliuqiu' });
  expect(html).toContain('data-spot="xiaoliuqiu" aria-pressed="true"><span>✓ 小琉球</span><span class="here">你在這裡 · 不到 1 公里</span>');
  expect(html).toContain('data-spot="kenting" aria-pressed="false"><span>墾丁</span><span class="mut">61 公里</span>');
});

test('rows keep the given order', () => {
  const html = renderSpotSheet({ rows: [...rows].reverse(), currentId: 'kenting' });
  const order = [...html.matchAll(/data-spot="(\w+)"/g)].map((m) => m[1]);
  expect(order).toEqual(['kenting', 'xiaoliuqiu']);
});

test('no GPS → no distances and nobody is 你在這裡', () => {
  const html = renderSpotSheet({ rows: rows.map((r) => ({ ...r, km: null })), currentId: 'kenting' });
  expect(html).not.toContain('公里');
  expect(html).not.toContain('你在這裡');
});

test('backdrop closes, sheet is a labelled dialog with the footer line', () => {
  const html = renderSpotSheet({ rows, currentId: 'kenting' });
  expect(html).toContain('<div class="sheet-bg" data-action="close-sheet"></div>');
  expect(html).toContain('role="dialog" aria-modal="true" aria-label="選潛點"');
  expect(html).toContain('更多潛點陸續加入');
  expect(html).toMatch(/<button type="button" class="srow on" data-spot="kenting"/);
});
