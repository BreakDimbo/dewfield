import { z } from 'zod';
import { parseToken } from '@/core/board/ascii';
import { findGroups } from '@/core/board/match';
import { boardFromField } from '@/core/board/ascii';

const nonNegInt = z.number().int().nonnegative();
const crop = z.enum(['carrot', 'tomato', 'corn', 'eggplant', 'blueberry']);
const decor = z.enum(['windChime', 'planters', 'awning', 'beehive', 'bench', 'irrigation', 'glassMobile', 'dewLanterns']);
const special = z.enum(['sickleH', 'sickleV', 'dewOrb', 'bee']);
const unique = <T>(xs: readonly T[]) => new Set(xs).size === xs.length;

const row = z.string().refine((r) => {
  const toks = r.trim().split(/\s+/);
  return toks.length === 7 && toks.every((t) => parseToken(t) !== null);
}, 'row must hold 7 valid tokens');

const orderItem = z.object({ crop, count: z.number().int().positive() });

const active = z
  .object({
    id: z.string().min(1),
    clientId: z.enum(['amai', 'meiyi', 'laotao', 'xiaotang']),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    items: z.array(orderItem).min(1).max(2),
    moves: z.number().int().positive(),
    isTutorial: z.boolean(),
    dayExempt: z.boolean(),
    text: z.string(),
    delivered: z.partialRecord(crop, nonNegInt),
    attempts: nonNegInt,
  })
  .refine((a) => a.items.every((it) => (a.delivered[it.crop] ?? 0) <= it.count), 'delivered exceeds order');

export const HomesteadSchema = z
  .object({
    seed: nonNegInt.max(0xffffffff),
    day: z.number().int().min(1),
    phase: z.enum(['morning', 'dusk']),
    field: z.object({ rows: z.array(row).length(7), uids: z.array(nonNegInt).length(49) }),
    care: z.object({
      pointsLeft: nonNegInt,
      wateredRows: z.array(z.number().int().min(0).max(6)).refine(unique, 'duplicate watered row'),
      beeUsed: z.boolean(),
    }),
    wallet: z.object({ dewdrop: nonNegInt }),
    decor: z.object({ owned: z.array(decor).refine(unique, 'duplicate decor') }),
    commissions: z.object({
      cursor: nonNegInt,
      generatedCount: nonNegInt,
      active: active.nullable(),
      completed: z
        .array(
          z.object({
            id: z.string(),
            day: z.number().int().min(1),
            stars: z.union([z.literal(1), z.literal(2), z.literal(3)]),
            attempts: z.number().int().min(1),
          }),
        )
        .max(100),
    }),
    tutorial: z.object({ done: z.boolean(), completedSteps: z.array(z.string()), seenTips: z.array(z.string()) }),
    stats: z.object({
      harvested: z.record(crop, nonNegInt),
      specialsCreated: z.record(special, nonNegInt),
      combos: nonNegInt,
      commissionsCompleted: nonNegInt,
      maxCascadeDepth: nonNegInt,
      playMs: nonNegInt,
    }),
    runCounter: nonNegInt,
    uidCounter: nonNegInt,
  })
  .superRefine((h, ctx) => {
    const uids = h.field.uids;
    if (!unique(uids)) ctx.addIssue({ code: 'custom', message: 'field uids must be unique', path: ['field', 'uids'] });
    if (uids.some((u) => u >= h.uidCounter)) ctx.addIssue({ code: 'custom', message: 'uid ≥ uidCounter', path: ['uidCounter'] });
  });

export const SaveFileSchema = z.object({
  schemaVersion: z.literal(1),
  savedAt: nonNegInt,
  build: z.string(),
  homestead: HomesteadSchema,
});

export type SaveFileV1 = z.infer<typeof SaveFileSchema>;

/** 02 §12.3 last bullet: a loaded field must be quiet (repair via legalize, logged as legalize_fix). */
export function fieldHasMatches(rows: readonly string[], uids: readonly number[]): boolean {
  return findGroups(boardFromField(rows, uids).cells).length > 0;
}
