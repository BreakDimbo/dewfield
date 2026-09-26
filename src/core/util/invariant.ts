export class InvariantError extends Error {
  override name = 'InvariantError';
}

export function invariant(cond: unknown, message: string): asserts cond {
  if (!cond) throw new InvariantError(message);
}
