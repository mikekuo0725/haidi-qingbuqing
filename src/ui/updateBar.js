// Shown when a new version has finished downloading in the background.
// Pressing the button swaps to the new version; ignoring it changes nothing.
export function renderUpdateBar() {
  return '<span>🆕 有新版</span><button type="button" data-update>更新</button>';
}
