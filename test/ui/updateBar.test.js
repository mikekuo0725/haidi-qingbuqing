import { test, expect } from 'vitest';
import { renderUpdateBar } from '../../src/ui/updateBar.js';

test('the update bar says there is a new version and has one update button', () => {
  const html = renderUpdateBar();
  expect(html).toContain('🆕 有新版');
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).toContain('data-update');
  expect(html).toContain('>更新<');
});
