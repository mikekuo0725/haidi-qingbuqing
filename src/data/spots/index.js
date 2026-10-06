import xiaoliuqiu from './xiaoliuqiu.json';
import kenting from './kenting.json';
import qixing from './qixing.json';
import northeast from './northeast.json';
import ludao from './ludao.json';
import lanyu from './lanyu.json';
import penghuNorth from './penghu-north.json';
import penghuSouth from './penghu-south.json';

// Order = order in the spot list when there is no GPS.
export const SPOT_LIST = [xiaoliuqiu, kenting, qixing, northeast, ludao, lanyu, penghuNorth, penghuSouth];
export const SPOTS = Object.fromEntries(SPOT_LIST.map((s) => [s.id, s]));
export const DEFAULT_SPOT_ID = xiaoliuqiu.id;
