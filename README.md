# 海底清不清

預測潛點海底能見度的手機網頁。設計:`docs/superpowers/specs/2026-09-27-haidi-qingbuqing-design.md`

## 上線網址
- 網頁:https://haidi-qingbuqing.mikekuo0725.workers.dev
- 衛星小幫手:https://haidi-helper.mikekuo0725.workers.dev

（原計畫預期網址是 `*.pages.dev`；部署當下 Cloudflare 已把 Pages 併入 Workers 平台，實際網址變成 `*.workers.dev`，功能不受影響。）

## 常用指令
- 開發：`npm run dev`(另開 `cd worker && npx wrangler dev --config wrangler.toml --local --port 8787`)
- 測試：`npm test`
- 部署網頁:`npm run build`,再 `npx wrangler deploy`(在專案根目錄;設定在 `wrangler.jsonc`,只上傳 `dist/` 靜態檔)
  - ⚠️ 不要再用 `wrangler pages deploy`:Cloudflare 已把 Pages 併入 Workers,舊指令會自己在 `vite.config.js` 塞 `@cloudflare/vite-plugin`,弄壞測試
  - 如果 wrangler 說找不到 `dist\wrangler.json`:把 `.wrangler/deploy/config.json` 改名收起來再部署
- 部署小幫手:`cd worker && npx wrangler deploy --config wrangler.toml`
  - ⚠️ 一定要加 `--config wrangler.toml`:根目錄有網頁用的 `wrangler.jsonc`,不指定的話在 `worker/` 裡打 `wrangler deploy` 會誤上傳網頁(2026-09-29 踩到,沒造成損害)。不確定時先加 `--dry-run`,看到 `env.CACHE`(KV)才是小幫手
- Firestore 規則:`npx firebase deploy --only firestore`
- 加潛點:在 `src/data/spots/` 加一個 JSON,加進 `index.js` 的 `SPOT_LIST`(順序 = 沒 GPS 時清單的順序)。再在 `scripts/coastline-spots.json` 加這個潛點的地圖範圍(要包住所有分區點;半島要加 `close` 兩個陸地那側、範圍外的點),跑 `node scripts/coastline.mjs <新潛點id>` 產生 `src/data/spots/maps/<id>.json`,加進 `src/data/spots/maps/index.js`。右上角的箭頭小框會蓋住地圖右上角約四分之一,分區點別放在那裡,不然會被擋住。沒做的話主畫面會顯示舊的海流文字,不會壞。台灣的潛點再加 `cwaArea`:氣象署「鄉鎮沿海預報」的區名(例如 `恆春鎮沿海`),要跟氣象署一字不差;國外潛點不要加,會照舊用 Open-Meteo。加完要重新部署**小幫手和網頁**;部署小幫手後,先 `curl` 一次 `https://haidi-helper.mikekuo0725.workers.dev/v1/base?spot=<新潛點id>` 暖機(第一次要抓衛星,要好幾秒),再部署網頁
- 氣象署金鑰:小幫手要有祕密 `CWA_KEY`(氣象署開放資料平臺的授權碼),設定一次就好:`cd worker && npx wrangler secret put CWA_KEY --config wrangler.toml`。沒設定的話台灣潛點也照舊用 Open-Meteo。金鑰不要放進程式或 git。
- 調參數:`src/core/constants.js`
- 每週檢查(設計文件 §8.3):Firebase 主控台匯出 `reports`,看 ①`meters` 跟 `snapshot.meters` 平均差幾米 ②預測「比平常清」的那幾筆,有幾成真的比平常清
