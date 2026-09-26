/** The only place in the codebase allowed to read the wall clock (03 §12). */
export const now = (): number => Date.now();
