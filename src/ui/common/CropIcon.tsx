import type { CropId } from '@/core/config/crops';

const LEAF = 'var(--c-sage)';

/** Flat icons that echo the 3D silhouettes (RD-1), readable at 20 px. */
export function CropIcon({ crop, size = 28 }: { crop: CropId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      {crop === 'carrot' && (
        <>
          <path d="M16 30 C13 22 10.5 16 11 12.5 C11.4 10 13.4 9.2 16 9.2 C18.6 9.2 20.6 10 21 12.5 C21.5 16 19 22 16 30Z" fill="var(--c-carrot)" />
          <path d="M16 10 C14 6 12 4 10 3.5 M16 10 C16 6 16.5 3.5 17.5 2 M16 10 C18 7 20.5 5.5 23 5.5" stroke={LEAF} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </>
      )}
      {crop === 'tomato' && (
        <>
          <ellipse cx="16" cy="18.5" rx="11.5" ry="9.5" fill="var(--c-tomato)" />
          <path d="M16 9.5 L13 7.5 M16 9.5 L19 7.5 M16 9.5 L11 10.5 M16 9.5 L21 10.5 M16 9.5 V5.5" stroke={LEAF} strokeWidth="2.2" strokeLinecap="round" />
        </>
      )}
      {crop === 'corn' && (
        <>
          <rect x="11.5" y="4" width="9" height="21" rx="4.5" fill="var(--c-corn)" />
          <path d="M11 29 C8 22 8.5 14 11.5 9 M21 29 C24 22 23.5 14 20.5 9" stroke={LEAF} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </>
      )}
      {crop === 'eggplant' && (
        <>
          <path d="M12.5 11 C7 15 6.5 25 12.5 28.5 C18.5 31.5 25 27 23.5 20 C22.5 15.5 20 12 18 10.5Z" fill="var(--c-eggplant)" />
          <path d="M11.5 11.5 C14 8.5 17.5 8.5 19.5 10.5 M16.5 9 L18.5 4" stroke={LEAF} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </>
      )}
      {crop === 'blueberry' && (
        <>
          <circle cx="10.5" cy="20" r="6" fill="var(--c-blueberry)" />
          <circle cx="21.5" cy="20" r="6" fill="var(--c-blueberry)" />
          <circle cx="16" cy="11.5" r="6" fill="var(--c-blueberry)" />
          <path d="M16 6.5 L16 5" stroke={LEAF} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function DewIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2.5 C16 8 19 11.5 19 15 A7 7 0 0 1 5 15 C5 11.5 8 8 12 2.5Z" fill="var(--c-dew)" />
      <path d="M9 15.5 A3 3 0 0 0 12 18.5" stroke="var(--c-white)" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.85" />
    </svg>
  );
}
