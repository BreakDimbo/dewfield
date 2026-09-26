import type { DecorId } from '@/core/homestead/state';

export type DecorEffect =
  | { type: 'extraMoves'; value: number }
  | { type: 'unlockCare'; value: 'bee' }
  | { type: 'carePointsMax'; value: number }
  | { type: 'rushBonus'; value: number };

export interface DecorDef {
  id: DecorId;
  name: string;
  price: number;
  level: 1 | 2 | 3;
  effect: DecorEffect | null;
  spot: string;
  blurb: string;
}

/** 02 §16.2 (prices calibrated in docs/balance/MVP-report.md, 04 P2-23). */
export const DECOR: readonly DecorDef[] = [
  { id: 'windChime', name: '风铃', price: 200, level: 1, effect: { type: 'extraMoves', value: 1 }, spot: 'spot_door_left', blurb: '风一吹，市集的人愿意多等你一步。' },
  { id: 'planters', name: '陶土花盆', price: 260, level: 1, effect: null, spot: 'spot_field_corners', blurb: '田四角的小陶盆，种着薄荷。' },
  { id: 'awning', name: '亚麻遮阳帘', price: 380, level: 1, effect: null, spot: 'spot_entrance', blurb: '午后的光变得软软的。' },
  { id: 'beehive', name: '蜂箱', price: 510, level: 1, effect: { type: 'unlockCare', value: 'bee' }, spot: 'spot_field_left', blurb: '解锁照料「放蜂」。' },
  { id: 'bench', name: '木长椅', price: 410, level: 2, effect: null, spot: 'spot_front_right', blurb: '坐下来看看你的田。' },
  { id: 'irrigation', name: '小水渠', price: 640, level: 2, effect: { type: 'carePointsMax', value: 1 }, spot: 'spot_field_edge', blurb: '每天多 1 次照料。' },
  { id: 'glassMobile', name: '玻璃挂饰', price: 660, level: 3, effect: null, spot: 'spot_dome_center', blurb: '晨光穿过时会在地上画彩虹。' },
  { id: 'dewLanterns', name: '露水灯', price: 770, level: 3, effect: { type: 'rushBonus', value: 2 }, spot: 'spot_frame_lights', blurb: '丰收时刻多 2 把镰刀。' },
];

export const DECOR_BY_ID: Readonly<Record<DecorId, DecorDef>> = Object.fromEntries(DECOR.map((d) => [d.id, d])) as Record<
  DecorId,
  DecorDef
>;
