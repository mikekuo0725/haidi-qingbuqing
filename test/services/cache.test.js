import { test, expect } from 'vitest';
import { saveWeather, loadWeather } from '../../src/services/cache.js';

const storage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('save then load', () => {
  const s = storage();
  saveWeather(s, 'xiaoliuqiu', { a: 1 }, 1000);
  expect(loadWeather(s, 'xiaoliuqiu')).toEqual({ raw: { a: 1 }, savedAt: 1000 });
});

test('nothing saved → null; broken JSON → null', () => {
  const s = storage();
  expect(loadWeather(s, 'xiaoliuqiu')).toBeNull();
  s.setItem('haidi:weather:xiaoliuqiu', '{broken');
  expect(loadWeather(s, 'xiaoliuqiu')).toBeNull();
});
