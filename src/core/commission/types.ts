import type { CropId } from '@/core/config/crops';

export type ClientId = 'amai' | 'meiyi' | 'laotao' | 'xiaotang';

export interface OrderItem {
  crop: CropId;
  count: number;
}

/** 02 §12.2 */
export interface ActiveCommission {
  id: string;
  clientId: ClientId;
  tier: 1 | 2 | 3;
  items: OrderItem[];
  moves: number;
  isTutorial: boolean;
  dayExempt: boolean;
  text: string;
  delivered: Partial<Record<CropId, number>>;
  attempts: number;
}
