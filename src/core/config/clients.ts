import type { ClientId } from '@/core/commission/types';

export interface ClientDef {
  id: ClientId;
  name: string;
  shop: string;
  tone: string;
  templates: [single: string, double: string];
  /** Avatar tint for the placeholder portrait. */
  tint: string;
}

/** 02 §16.4 */
export const CLIENTS: Readonly<Record<ClientId, ClientDef>> = {
  amai: {
    id: 'amai',
    name: '阿麦',
    shop: '面包房',
    tone: '爽朗、说话快',
    templates: ['今天的新面包要{a}{n}个！', '{a}{n}、{b}{m}，拜托啦！'],
    tint: '#E3BE4F',
  },
  meiyi: {
    id: 'meiyi',
    name: '莓姨',
    shop: '果酱铺',
    tone: '温柔、爱唠叨',
    templates: ['熬一锅{a}酱，要{n}个熟透的。', '{a}{n}个、{b}{m}个，慢慢来不着急。'],
    tint: '#4E78C4',
  },
  laotao: {
    id: 'laotao',
    name: '老陶',
    shop: '汤馆',
    tone: '慢性子、讲究',
    templates: ['汤底要{a}{n}个，得是熟的。', '{a}{n}，{b}{m}，火候不等人。'],
    tint: '#D9A39A',
  },
  xiaotang: {
    id: 'xiaotang',
    name: '小糖',
    shop: '甜品站',
    tone: '年轻、爱用感叹号',
    templates: ['新品要{a}{n}个！', '{a}{n}+{b}{m}，冲！'],
    tint: '#D2553F',
  },
};
