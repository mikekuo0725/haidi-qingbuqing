// Sea map shapes, made by `node scripts/coastline.mjs`. Kept out of the spot JSON on purpose:
// the Worker imports the spot list and does not need the shapes (only the bboxes, for the ship list).
import xiaoliuqiu from './xiaoliuqiu.json';
import kenting from './kenting.json';
import qixing from './qixing.json';
import northeast from './northeast.json';
import ludao from './ludao.json';
import lanyu from './lanyu.json';
import penghuNorth from './penghu-north.json';
import penghuSouth from './penghu-south.json';

export const MAPS = {
  xiaoliuqiu, kenting, qixing, northeast, ludao, lanyu,
  'penghu-north': penghuNorth, 'penghu-south': penghuSouth,
};
