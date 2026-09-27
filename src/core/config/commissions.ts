import type { ClientId, OrderItem } from '@/core/commission/types';

export interface CommissionDef {
  id: string;
  clientId: ClientId;
  tier: 1 | 2 | 3;
  items: OrderItem[];
  moves: number;
  isTutorial: boolean;
  dayExempt: boolean;
  text: string;
  fixture?: string;
  spawnQueue?: string;
  guidedMoves?: { a: [number, number]; b: [number, number] }[];
}

/** 02 §11.2 — the initial field of every new save. */
export const T1_FIXTURE = `
T2 M2 B2 T2 M2 B2 T2
M2 B2 T2 M2 B2 T2 M2
B2 T2 C2 B2 T2 M2 B2
C2 C2 M2 C2 M2 B2 T2
M2 B2 C2 M2 B2 T2 M2
B2 T2 M2 C2 T2 M2 C2
T2 M2 B2 T2 C2 C2 T2
`;

/** 02 §16.3 — calibrated by simulation (docs/balance/VS-report.md, MVP-report.md). */
export const COMMISSIONS: readonly CommissionDef[] = [
  {
    id: 'T1',
    clientId: 'amai',
    tier: 1,
    items: [{ crop: 'carrot', count: 10 }],
    moves: 10,
    isTutorial: true,
    dayExempt: true,
    text: '第一篮胡萝卜，帮我挑 10 个熟的！',
    fixture: T1_FIXTURE,
    spawnQueue: 'M2 B2 M2 M2 T2 T2',
    guidedMoves: [
      { a: [6, 5], b: [6, 6] },
      { a: [2, 2], b: [2, 3] },
      { a: [3, 5], b: [2, 5] },
    ],
  },
  {
    id: 'T2',
    clientId: 'laotao',
    tier: 1,
    items: [{ crop: 'tomato', count: 8 }],
    moves: 17,
    isTutorial: true,
    dayExempt: true,
    text: '熬汤要 8 个熟番茄，青的可不行哦。',
  },
  c('C01', 'amai', 1, 24, '胡萝卜面包今天限量，还要 10 个熟胡萝卜。', ['carrot', 10]),
  c('C02', 'meiyi', 1, 24, '果酱开锅了，12 个熟蓝莓，拜托啦。', ['blueberry', 12]),
  c('C03', 'laotao', 1, 24, '罗宋汤：番茄 8 个，胡萝卜 6 个。', ['tomato', 8], ['carrot', 6]),
  c('C04', 'xiaotang', 2, 12, '玉米布丁要 9 根熟玉米！', ['corn', 9]),
  c('C05', 'amai', 2, 12, '烤茄子番茄挞：茄子 9，番茄 6。', ['eggplant', 9], ['tomato', 6]),
  c('C06', 'meiyi', 2, 14, '蓝莓季到啦，11 个熟蓝莓。', ['blueberry', 11]),
  c('C07', 'laotao', 2, 11, '夏日杂菜汤：胡萝卜 7，玉米 6。', ['carrot', 7], ['corn', 6]),
  c('C08', 'xiaotang', 2, 13, '番茄糖渍要 10 个熟番茄！', ['tomato', 10]),
  c('C09', 'amai', 3, 20, '紫色面包节：茄子 18，蓝莓 15。', ['eggplant', 18], ['blueberry', 15]),
  c('C10', 'meiyi', 3, 12, '玉米番茄酱：玉米 10，番茄 8。', ['corn', 10], ['tomato', 8]),
  c('C11', 'laotao', 3, 14, '一大锅胡萝卜浓汤，12 个熟胡萝卜。', ['carrot', 12]),
  c('C12', 'xiaotang', 3, 16, '市集节甜品台：茄子 13，玉米 13！', ['eggplant', 13], ['corn', 13]),
];

function c(
  id: string,
  clientId: ClientId,
  tier: 1 | 2 | 3,
  moves: number,
  text: string,
  ...items: [OrderItem['crop'], number][]
): CommissionDef {
  return {
    id,
    clientId,
    tier,
    moves,
    text,
    items: items.map(([crop, count]) => ({ crop, count })),
    isTutorial: false,
    dayExempt: false,
  };
}

export const COMMISSION_BY_ID: Readonly<Record<string, CommissionDef>> = Object.fromEntries(
  COMMISSIONS.map((d) => [d.id, d]),
);
