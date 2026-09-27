import type { BufferGeometry } from 'three';
import type { CropSpecial, Stage } from '@/core/board/model';
import { CROP_IDS, type CropId } from '@/core/config/crops';
import { beeGeometry, cropGeometry, dishGeometry, markerGeometry, rimGeometry } from './greybox';
import { loadGlb } from './gltf';

/**
 * 03 §14 AssetManifest: logical ids → geometry sources. Swapping greybox for glTF art only touches this file:
 * flip `ART` to 'glb' (or try it first with `?models=glb`). Node names follow 03 §14 (`crop_<id>_s<stage>`, …);
 * the glb must satisfy 03 §14 (vertex colours, one primitive per node).
 */
export type AssetSource =
  { kind: 'greybox'; build: () => BufferGeometry } | { kind: 'gltf'; url: string; node: string };
export type ArtSet = 'greybox' | 'glb';

/** The shipped art set. 'greybox' = procedural (render/assets/greybox.ts); 'glb' = public/models/field.glb. */
const ART: ArtSet = 'greybox';

const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
export const FIELD_GLB = `${base}models/field.glb`;

const MARKERS: readonly CropSpecial[] = ['sickleH', 'sickleV', 'dewOrb'];
const STAGES: readonly Stage[] = [0, 1, 2];

export function manifestFor(art: ArtSet) {
  const src = (node: string, build: () => BufferGeometry): AssetSource =>
    art === 'glb' ? { kind: 'gltf', url: FIELD_GLB, node } : { kind: 'greybox', build };
  return {
    crop: (crop: CropId, stage: Stage) => src(`crop_${crop}_s${stage}`, () => cropGeometry(crop, stage)),
    marker: (kind: CropSpecial) => src(`marker_${kind}`, () => markerGeometry(kind)),
    bee: () => src('marker_bee', beeGeometry),
    plotDish: () => src('plot_dish', dishGeometry),
    rimRipe: () => src('rim_ripe', rimGeometry),
  };
}
export type Manifest = ReturnType<typeof manifestFor>;

/** Every logical asset with its 03 §14 node name — drives preload, the glb exporter and the parity test. */
export function assetList(m: Manifest): { id: string; src: AssetSource }[] {
  const out: { id: string; src: AssetSource }[] = [];
  for (const c of CROP_IDS) for (const s of STAGES) out.push({ id: `crop_${c}_s${s}`, src: m.crop(c, s) });
  for (const k of MARKERS) out.push({ id: `marker_${k}`, src: m.marker(k) });
  out.push(
    { id: 'marker_bee', src: m.bee() },
    { id: 'plot_dish', src: m.plotDish() },
    { id: 'rim_ripe', src: m.rimRipe() },
  );
  return out;
}

function selectedArt(): ArtSet {
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('models');
  return q === 'glb' || q === 'greybox' ? q : ART;
}

export const manifest = manifestFor(selectedArt());

const loaded = new Map<string, BufferGeometry>();
let pending: Promise<void> | null = null;

/**
 * Loads every glTF the manifest references (once). `null` when nothing is outstanding — the greybox set never
 * suspends. After it resolves, `geometryOf` stays synchronous for every id.
 */
export function assetsPending(m: Manifest = manifest): Promise<void> | null {
  const need = assetList(m).flatMap(({ src }) =>
    src.kind === 'gltf' && !loaded.has(`${src.url}#${src.node}`) ? [src] : [],
  );
  if (!need.length) return null;
  pending ??= Promise.all(
    [...new Set(need.map((s) => s.url))].map(async (url) => {
      for (const [node, g] of await loadGlb(url)) loaded.set(`${url}#${node}`, g);
    }),
  ).then(() => {
    const missing = need.filter((s) => !loaded.has(`${s.url}#${s.node}`)).map((s) => s.node);
    if (missing.length) throw new Error(`glTF nodes missing: ${missing.join(', ')}`);
  });
  return pending;
}

export function geometryOf(src: AssetSource): BufferGeometry {
  if (src.kind === 'greybox') return src.build();
  const g = loaded.get(`${src.url}#${src.node}`);
  if (!g) throw new Error(`asset ${src.node} (${src.url}) used before assetsPending() resolved`);
  return g;
}
