/** Cell (x, y) ↔ world (X, Z). y = 0 is the far edge (nursery side), +y comes toward the camera. */
export const CELL = 1;
export const HALF = 3;

export const cellX = (x: number) => (x - HALF) * CELL;
export const cellZ = (y: number) => (y - HALF) * CELL;
