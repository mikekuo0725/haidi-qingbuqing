# 海底清不清

預測潛點海底能見度的手機網頁。設計:`docs/superpowers/specs/2026-09-27-haidi-qingbuqing-design.md`

## 上線網址
- 網頁:https://haidi-qingbuqing.mikekuo0725.workers.dev
- 衛星小幫手:https://haidi-helper.mikekuo0725.workers.dev

（原計畫預期網址是 `*.pages.dev`；部署當下 Cloudflare 已把 Pages 併入 Workers 平台，實際網址變成 `*.workers.dev`，功能不受影響。）

## 常用指令(簡單版)

怎麼用:在程式資料夾打開終端機(打指令的黑色視窗),貼上需要的那一行。

| 想做什麼 | 打這個 | 白話 |
|---|---|---|
| 在自己電腦先看網站 | `npm run dev` | 打開 http://localhost:5173 就能看,只有你看得到 |
| 檢查有沒有改壞 | `npm test` | 電腦自動檢查,全部通過才放心 |
| 網頁上線 | `npm run build` 然後 `npx wrangler deploy` | 先打包網站,再傳到 Cloudflare |
| 小幫手上線 | `cd worker && npx wrangler deploy --config wrangler.toml` | 小幫手 = 在後台抓天氣、衛星、浮標的程式 |
| 推到 GitHub | `git push` | 把改好的程式備份到 GitHub |

比較少用的:
- **加潛點**:步驟很多,看下面「詳細說明」
- **調參數**(分數怎麼算):改 `src/core/constants.js`
- **金鑰**:設一次就好,平常不用動

⚠️ 最重要的兩條:
1. 小幫手上線一定要加 `--config wrangler.toml`,不加會把網頁傳錯地方
2. 不要用 `wrangler pages deploy`(舊指令,會弄壞程式)

## 詳細說明(給改程式的人)
- 開發：`npm run dev`(另開 `cd worker && npx wrangler dev --config wrangler.toml --local --port 8787`)
- 測試：`npm test`
- 部署網頁:`npm run build`,再 `npx wrangler deploy`(在專案根目錄;設定在 `wrangler.jsonc`,只上傳 `dist/` 靜態檔)
  - ⚠️ 不要再用 `wrangler pages deploy`:Cloudflare 已把 Pages 併入 Workers,舊指令會自己在 `vite.config.js` 塞 `@cloudflare/vite-plugin`,弄壞測試
  - 如果 wrangler 說找不到 `dist\wrangler.json`:把 `.wrangler/deploy/config.json` 改名收起來再部署
- 部署小幫手:`cd worker && npx wrangler deploy --config wrangler.toml`
  - ⚠️ 一定要加 `--config wrangler.toml`:根目錄有網頁用的 `wrangler.jsonc`,不指定的話在 `worker/` 裡打 `wrangler deploy` 會誤上傳網頁(2026-09-29 踩到,沒造成損害)。不確定時先加 `--dry-run`,看到 `env.CACHE`(KV)才是小幫手
- Firestore(潛伴回報,已拿掉):資料庫鎖住、不刪;規則上線 `npx firebase deploy --only firestore:rules`
- 加潛點:在 `src/data/spots/` 加一個 JSON,加進 `index.js` 的 `SPOT_LIST`(順序 = 沒 GPS 時清單的順序)。再在 `scripts/coastline-spots.json` 加這個潛點的地圖範圍(要包住所有分區點;半島要加 `close` 兩個陸地那側、範圍外的點;整座島都在範圍內就不用 `close`),跑 `node scripts/coastline.mjs <新潛點id>` 產生 `src/data/spots/maps/<id>.json`,加進 `src/data/spots/maps/index.js`。想在地圖上畫潛點名字和分區邊界,在 `src/data/spots/sites/` 加 `<id>.json`(格式見那裡的 `index.js`:每條邊界從一個岬角朝 `bearing` 往外海畫,`next` 是順時針到下一條邊界之間的分區),加進 `index.js`;`test/data/siteLayers.test.js` 會檢查每個潛點真的落在它寫的分區、名字沒有互相蓋住。沒加的潛點照舊用圓點代表分區。沒做的話主畫面會顯示舊的海流文字,不會壞。台灣的潛點再加 `cwaArea`:氣象署「鄉鎮沿海預報」的區名(例如 `恆春鎮沿海`),要跟氣象署一字不差;國外潛點不要加,會照舊用 Open-Meteo。加完要重新部署**小幫手和網頁**;部署小幫手後,先 `curl` 一次 `https://haidi-helper.mikekuo0725.workers.dev/v1/base?spot=<新潛點id>` 暖機(第一次要抓衛星,要好幾秒),再部署網頁
- 氣象署金鑰:小幫手要有祕密 `CWA_KEY`(氣象署開放資料平臺的授權碼),設定一次就好:`cd worker && npx wrangler secret put CWA_KEY --config wrangler.toml`。沒設定的話台灣潛點也照舊用 Open-Meteo。金鑰不要放進程式或 git。
- 氣象署浮標:台灣的潛點再加 `buoy`(`{ "id": "46714D", "name": "小琉球浮標" }`,浮標代號在氣象署開放資料 `O-B0075-001`)。小幫手每小時第 35 分抓一次,存 4 天(每天台灣 06:35 那一次改做衛星更新,浮標資料隔一小時會補回來;Cloudflare 免費帳號整個帳號最多 5 個排程,所以小幫手只用 2 個);網頁用它換掉「前 3 天的浪」(那天過完、至少 12 小時有浪才換),今天的頁面多一行「🛟 浮標 實測」。用同一把 `CWA_KEY`,不用另外設定。沒有 `buoy` 的潛點照舊。
- 調參數:`src/core/constants.js`
