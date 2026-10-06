import { test, expect } from 'vitest';
import { SPOTS, SPOT_LIST, DEFAULT_SPOT_ID } from '../../src/data/spots/index.js';

test('every spot has the fields the code needs', () => {
  for (const spot of Object.values(SPOTS)) {
    expect(spot.thresholds.purple).toBeGreaterThan(spot.thresholds.green);
    expect(spot.thresholds.green).toBeGreaterThan(spot.thresholds.yellow);
    expect(spot.rainPoints.length).toBeGreaterThan(0);
    expect(spot.zones.length).toBeGreaterThan(0);
    for (const z of spot.zones) {
      expect(['open', 'semi', 'bay']).toContain(z.shelter);
      expect(['sand', 'mixed', 'rock']).toContain(z.bottom);
      expect(z.riverImpact).toBeGreaterThanOrEqual(0);
      expect(z.riverImpact).toBeLessThanOrEqual(1);
      expect(z.satBox[0][0]).toBeLessThan(z.satBox[1][0]);
      expect(z.satBox[0][1]).toBeLessThan(z.satBox[1][1]);
    }
  }
  expect(SPOTS[DEFAULT_SPOT_ID]).toBeDefined();
});

test('spot ids and zone ids are unique, facings are compass degrees', () => {
  const ids = SPOT_LIST.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(Object.keys(SPOTS).sort()).toEqual([...ids].sort());
  for (const s of SPOT_LIST) {
    expect(SPOTS[s.id]).toBe(s);
    expect(s.locateMaxKm).toBeGreaterThan(0);
    const zoneIds = s.zones.map((z) => z.id);
    expect(new Set(zoneIds).size).toBe(zoneIds.length);
    for (const z of s.zones) {
      expect(z.facing).toBeGreaterThanOrEqual(0);
      expect(z.facing).toBeLessThan(360);
      expect(z.fallbackBase).toBeGreaterThan(0);
    }
  }
});

test('墾丁 has 西岸 / 南灣 / 東岸', () => {
  expect(SPOTS.kenting.name).toBe('墾丁');
  expect(SPOTS.kenting.zones.map((z) => z.id)).toEqual(['west', 'south', 'east']);
  expect(SPOT_LIST.map((s) => s.id)).toEqual(['xiaoliuqiu', 'kenting', 'qixing', 'northeast', 'ludao', 'lanyu', 'penghu-north']);
});

test('東北角 has 鼻頭角 / 龍洞灣 / 和美, a small 雙溪 effect and a monsoon notice', () => {
  const n = SPOTS.northeast;
  expect(n.name).toBe('東北角');
  expect(n.zones.map((z) => z.id)).toEqual(['bitou', 'longdong', 'hemei']);
  expect(n.zones.map((z) => z.name)).toEqual(['鼻頭角', '龍洞灣', '和美']);
  expect(n.riverName).toBe('雙溪');
  expect(n.zones.every((z) => z.riverImpact <= 0.2)).toBe(true);
  expect(n.notice).toContain('東北季風');
});

test('七星岩 is its own spot: 2 sides, no river effect, a safety notice', () => {
  const q = SPOTS.qixing;
  expect(q.name).toBe('七星岩');
  expect(q.zones.map((z) => z.id)).toEqual(['north', 'south']);
  expect(q.zones.every((z) => z.riverImpact === 0)).toBe(true);
  expect(q.notice).toContain('高級潛點');
  for (const s of SPOT_LIST) {
    if (s.notice !== undefined) {
      expect(typeof s.notice).toBe('string');
      expect(s.notice.length).toBeLessThanOrEqual(40);
    }
  }
});

test('Taiwan spots name their 氣象署 coastal area', () => {
  expect(SPOT_LIST.map((s) => [s.id, s.cwaArea])).toEqual([
    ['xiaoliuqiu', '琉球鄉_南方沿海'],
    ['kenting', '恆春鎮沿海'],
    ['qixing', '恆春鎮沿海'],
    ['northeast', '貢寮區沿海'],
    ['ludao', '綠島鄉_南方沿海'],
    ['lanyu', '蘭嶼鄉_南方沿海'],
    ['penghu-north', '白沙鄉沿海'],
  ]);
});

test('Taiwan spots name their 氣象署 buoy', () => {
  expect(SPOT_LIST.map((s) => [s.id, s.buoy?.id, s.buoy?.name])).toEqual([
    ['xiaoliuqiu', '46714D', '小琉球浮標'],
    ['kenting', '46759A', '鵝鑾鼻浮標'],
    ['qixing', '46759A', '鵝鑾鼻浮標'],
    ['northeast', '46694A', '龍洞浮標'],
    ['ludao', undefined, undefined],
    ['lanyu', 'C6S94', '蘭嶼浮標'],
    ['penghu-north', '46735A', '澎湖浮標'],
  ]);
});

test('綠島 has 柴口 / 石朗 / 大白沙 / 東岸, a small 卑南溪 effect and a 黑潮 notice', () => {
  const g = SPOTS.ludao;
  expect(g.name).toBe('綠島');
  expect(g.zones.map((z) => z.id)).toEqual(['chaikou', 'shilang', 'dabaisha', 'east']);
  expect(g.zones.map((z) => z.name)).toEqual(['柴口', '石朗', '大白沙', '東岸']);
  expect(g.riverName).toBe('卑南溪');
  expect(g.zones.every((z) => z.riverImpact <= 0.1)).toBe(true);
  expect(g.notice).toContain('黑潮');
  expect(g.buoy).toBeUndefined();
});

test('蘭嶼 has 開元港 / 八代灣 / 東清灣 / 朗島, no river effect and a 黑潮 notice', () => {
  const l = SPOTS.lanyu;
  expect(l.name).toBe('蘭嶼');
  expect(l.zones.map((z) => z.id)).toEqual(['kaiyuan', 'badai', 'dongqing', 'langdao']);
  expect(l.zones.map((z) => z.name)).toEqual(['開元港', '八代灣', '東清灣', '朗島']);
  expect(l.zones.every((z) => z.riverImpact === 0)).toBe(true);
  expect(l.notice).toContain('黑潮');
});

test('澎湖北海 has 吉貝 / 目斗嶼 / 姑婆嶼 / 險礁, no river effect and a 東北季風 notice', () => {
  const p = SPOTS['penghu-north'];
  expect(p.name).toBe('澎湖北海');
  expect(p.zones.map((z) => z.id)).toEqual(['jibei', 'mudou', 'gupo', 'xianjiao']);
  expect(p.zones.map((z) => z.name)).toEqual(['吉貝', '目斗嶼', '姑婆嶼', '險礁']);
  expect(p.zones.every((z) => z.riverImpact === 0)).toBe(true);
  expect(p.notice).toContain('東北季風');
});
