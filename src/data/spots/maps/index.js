// Sea map shapes, made by `node scripts/coastline.mjs`. Kept out of the spot JSON on purpose:
// the Worker imports the spot list and does not need them.
import xiaoliuqiu from './xiaoliuqiu.json';
import kenting from './kenting.json';
import qixing from './qixing.json';

export const MAPS = { xiaoliuqiu, kenting, qixing };
