export function installHint(ua, standalone) {
  if (standalone || !/iPhone|iPad/.test(ua)) return null;
  if (/ Line\//.test(ua)) return '📲 用 Safari 打開這個網址，就能加到主畫面';
  if (/Version\/.*Safari/.test(ua)) return '📲 iPhone：點下方「分享」→「加入主畫面」，沒訊號也能打開';
  return null;
}
