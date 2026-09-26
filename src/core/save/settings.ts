import { z } from 'zod';

/** 02 §12.2 SettingsV1 — stored under its own key so a save reset keeps it. */
export const SettingsSchema = z.object({
  schemaVersion: z.literal(1),
  volume: z.object({ master: z.number().min(0).max(1), music: z.number().min(0).max(1), sfx: z.number().min(0).max(1) }),
  reducedMotion: z.boolean(),
  quality: z.enum(['auto', 'high', 'low']),
});
export type SettingsV1 = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS_V1: SettingsV1 = {
  schemaVersion: 1,
  volume: { master: 0.8, music: 0.6, sfx: 0.8 },
  reducedMotion: false,
  quality: 'auto',
};

export function parseSettings(raw: string | null): SettingsV1 {
  if (!raw) return DEFAULT_SETTINGS_V1;
  try {
    const r = SettingsSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : DEFAULT_SETTINGS_V1;
  } catch {
    return DEFAULT_SETTINGS_V1;
  }
}
