/**
 * Complexity ceilings for a stored specification.
 *
 * Sized from `verification/reference-fixture.md`: Northstar's seven required routes come
 * to roughly 81 nodes with a largest single page of 16, so 250 leaves ample headroom for
 * a real product while staying far below the protected DS/SPEC suite ceilings
 * (maxDepth 16, maxNodes 400, maxBytes 1 MB, maxCost 10000).
 */
export const LIMITS = Object.freeze({
  /** Node-tree depth: how deeply components may nest through slots. */
  maxDepth: 8,
  /** Total component instances in one specification. */
  maxNodes: 250,
  /** Serialised size ceiling. */
  maxBytes: 262_144,
  /** Static cost budget. The cost model itself arrives with the query AST at G3. */
  maxCost: 1_000,
  /** Structural nesting of the raw document, including prop values. Guards recursion. */
  maxStructuralDepth: 24
} as const);

export type Limits = typeof LIMITS;
