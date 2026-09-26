/** 02 §16.5 contextual tips — shown once per save (tutorial.seenTips). */
export type TipId =
  | 'fieldMemory'
  | 'onlyRipe'
  | 'preview'
  | 'sproutHarvest'
  | 'neighborRipen'
  | 'dewOrb'
  | 'bee'
  | 'combo'
  | 'shuffle'
  | 'firstFail'
  | 'care'
  | 'rush'
  | 'shop'
  | 'sleep'
  | 'morning'
  | 'levelUp';

export const TIPS: Record<TipId, string> = {
  fieldMemory: '收过的地方长出了新芽，这块田会记得你。',
  onlyRipe: '只有「熟」的作物才能交货；芽和青也能消，只是不算数。',
  preview: '按住拖动可以预览结果，拖回原处就取消；每局还能回退一步。',
  sproutHarvest: '芽还没长成，收了不算数。',
  neighborRipen: '消除会让相邻的作物长大一格。先催熟，再收割！',
  dewOrb: 'L/T 形消除结出了晨露珠：收割 3×3，还会让外面一圈长大。',
  bee: '蜂群：和任意作物交换，那种作物会全部授粉成熟并被收割。',
  combo: '把两个特效换到一起，会合成更强的效果。',
  shuffle: '没有能走的步了，田里重新排了排。',
  firstFail: '没关系，交了的都算数。回露台照料一下，明天再来会更容易。',
  care: '早上先看委托：{client}要{crop}。找{crop}多的一行浇一浇，它们马上就会长大。',
  rush: '委托完成！剩下的步数变成了镰刀，丰收时刻！',
  shop: '市集收工了。用露珠给露台添点东西吧。',
  sleep: '累了就入夜吧。一夜过去，所有作物都会长大一格。',
  morning: '新的一天！先看看今天的委托，再决定浇哪一垄。',
  levelUp: '露台升级了！新的装饰可以买了。',
};

export const TIP_IDS = Object.keys(TIPS) as TipId[];
