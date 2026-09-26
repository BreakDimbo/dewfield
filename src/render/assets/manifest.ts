import type { BufferGeometry } from 'three';
import type { CropSpecial, Stage } from '@/core/board/model';
import type { CropId } from '@/core/config/crops';
import { beeGeometry, cropGeometry, dishGeometry, markerGeometry, rimGeometry } from './greybox';

/**
 * 03 §14 AssetManifest: logical ids → geometry sources. Swapping greybox for glTF art only touches this file
 * (entries become `{ kind: 'gltf', url, node }` resolved by a loader).
 */
export type AssetSource = { kind: 'greybox'; build: () => BufferGeometry };

export const manifest = {
  crop: (crop: CropId, stage: Stage): AssetSource => ({ kind: 'greybox', build: () => cropGeometry(crop, stage) }),
  marker: (kind: CropSpecial): AssetSource => ({ kind: 'greybox', build: () => markerGeometry(kind) }),
  bee: (): AssetSource => ({ kind: 'greybox', build: beeGeometry }),
  plotDish: (): AssetSource => ({ kind: 'greybox', build: dishGeometry }),
  rimRipe: (): AssetSource => ({ kind: 'greybox', build: rimGeometry }),
};

export const geometryOf = (src: AssetSource): BufferGeometry => src.build();
