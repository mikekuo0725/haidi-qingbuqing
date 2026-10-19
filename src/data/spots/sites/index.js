// Named dive sites and the zone borders drawn on the sea map. Kept apart from maps/*.json, which
// `node scripts/coastline.mjs` rewrites. Sources and decisions: 潛點名單草稿.md (design folder).
// A border runs from its cape straight out to sea on `bearing`; borders are listed clockwise by
// bearing, and `next` is the zone between that border and the next one. `hidden` borders only cut
// through land. A spot with no entry here keeps the old zone circles.
import xiaoliuqiu from './xiaoliuqiu.json';
import kenting from './kenting.json';
import ludao from './ludao.json';

export const SITE_LAYERS = { xiaoliuqiu, kenting, ludao };
