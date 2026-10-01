// Sea map shapes, made by `node scripts/coastline.mjs`. Kept out of the spot JSON on purpose:
// the Worker imports the spot list and does not need them.
import xiaoliuqiu from './xiaoliuqiu.json';
import kenting from './kenting.json';
import qixing from './qixing.json';
import northeast from './northeast.json';
import ludao from './ludao.json';
import lanyu from './lanyu.json';

export const MAPS = { xiaoliuqiu, kenting, qixing, northeast, ludao, lanyu };
