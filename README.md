# 海底清不清

預測潛點海底能見度的手機網頁。設計:`docs/superpowers/specs/2026-09-27-haidi-qingbuqing-design.md`

## 上線網址
- 網頁:https://haidi-qingbuqing.mikekuo0725.workers.dev
- 衛星小幫手:https://haidi-helper.mikekuo0725.workers.dev

（原計畫預期網址是 `*.pages.dev`；部署當下 Cloudflare 已把 Pages 併入 Workers 平台，實際網址變成 `*.workers.dev`，功能不受影響。）

## 常用指令
- 開發：`npm run dev`(另開 `cd worker && npx wrangler dev --local --port 8787`)
- 測試：`npm test`
- 部署網頁:`npm run build`,再 `npx wrangler deploy`(在專案根目錄;設定在 `wrangler.jsonc`,只上傳 `dist/` 靜態檔)
  - ⚠️ 不要再用 `wrangler pages deploy`:Cloudflare 已把 Pages 併入 Workers,舊指令會自己在 `vite.config.js` 塞 `@cloudflare/vite-plugin`,弄壞測試
  - 如果 wrangler 說找不到 `dist\wrangler.json`:把 `.wrangler/deploy/config.json` 改名收起來再部署
- 部署小幫手:`cd worker && npx wrangler deploy`
- Firestore 規則:`npx firebase deploy --only firestore`
- 加潛點:在 `src/data/spots/` 加一個 JSON,加進 `index.js` 的 `SPOT_LIST`(順序 = 沒 GPS 時清單的順序)。加完要重新部署**小幫手和網頁**;部署小幫手後,先 `curl` 一次 `https://haidi-helper.mikekuo0725.workers.dev/v1/base?spot=<新潛點id>` 暖機(第一次要抓衛星,要好幾秒),再部署網頁
- 調參數:`src/core/constants.js`
- 每週檢查(設計文件 §8.3):Firebase 主控台匯出 `reports`,看 ①`meters` 跟 `snapshot.meters` 平均差幾米 ②預測「比平常清」的那幾筆,有幾成真的比平常清
