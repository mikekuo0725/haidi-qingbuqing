import { test, expect } from 'vitest';
import { installHint } from '../../src/ui/installHint.js';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_LINE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.0.0';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36';

test('iPhone Safari gets the add-to-home-screen hint', () => {
  expect(installHint(IPHONE_SAFARI, false)).toBe('📲 iPhone：點下方「分享」→「加入主畫面」，沒訊號也能打開');
});

test('LINE browser: tell them to open in Safari first', () => {
  expect(installHint(IPHONE_LINE, false)).toBe('📲 用 Safari 打開這個網址，就能加到主畫面');
});

test('no hint on Android, on computers, or when already installed', () => {
  expect(installHint(ANDROID, false)).toBeNull();
  expect(installHint('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', false)).toBeNull();
  expect(installHint(IPHONE_SAFARI, true)).toBeNull();
});
