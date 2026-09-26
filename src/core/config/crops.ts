export type CropId = 'carrot' | 'tomato' | 'corn' | 'eggplant' | 'blueberry';

export interface CropDef {
  readonly id: CropId;
  readonly name: string;
  readonly ascii: 'C' | 'T' | 'M' | 'E' | 'B';
  readonly order: number;
  readonly color: string;
  readonly silhouette: string;
}

/** 02 §16.1 — order is used for every tie-break. */
export const CROPS: readonly CropDef[] = Object.freeze([
  { id: 'carrot', name: '胡萝卜', ascii: 'C', order: 0, color: '#E8894A', silhouette: '倒锥 + 叶簇' },
  { id: 'tomato', name: '番茄', ascii: 'T', order: 1, color: '#D2553F', silhouette: '扁球 + 星形萼' },
  { id: 'corn', name: '玉米', ascii: 'M', order: 2, color: '#E3BE4F', silhouette: '高柱穗 + 包叶' },
  { id: 'eggplant', name: '茄子', ascii: 'E', order: 3, color: '#7B5BA6', silhouette: '弯水滴' },
  { id: 'blueberry', name: '蓝莓', ascii: 'B', order: 4, color: '#4E78C4', silhouette: '三颗小球簇' },
] as const satisfies readonly CropDef[]);

export const CROP_IDS: readonly CropId[] = CROPS.map((c) => c.id);

export const CROP_BY_ID: Readonly<Record<CropId, CropDef>> = Object.freeze(
  Object.fromEntries(CROPS.map((c) => [c.id, c])) as Record<CropId, CropDef>,
);

export const CROP_BY_ASCII: Readonly<Record<string, CropDef>> = Object.freeze(
  Object.fromEntries(CROPS.map((c) => [c.ascii, c])),
);

export const cropOrder = (id: CropId): number => CROP_BY_ID[id].order;
