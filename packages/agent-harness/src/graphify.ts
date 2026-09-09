/**
 * Graphify policy (HAR-009; `docs/planning/agent-harness.md`, "Graphify policy").
 *
 * Graphify is a code-only, local index. It may accelerate discovery, and nothing more: its
 * output is context, never evidence. Two rules follow, and this module is the only place
 * they are decided.
 *
 * An index describes one repository at one commit, as read by one extractor version, with a
 * content hash proving it describes what it claims. If any of those fails to match the commit
 * actually under review, the index is *ignored with a recorded reason* rather than trusted --
 * a stale graph is worse than no graph, because it is confidently wrong. An absent index is
 * not an error either; it simply yields no context.
 *
 * Scope of that guarantee: both entry points are total over JSON-derived values, which is how
 * an index and its edges arrive (a content-hashed document, parsed). They do not defend against
 * a hostile in-process object whose property access itself throws -- a getter that raises, or a
 * Proxy trap -- where the raw error propagates. Closing that is a separate hardening task.
 *
 * An INFERRED edge is a guess. It can never on its own authorise a change or satisfy a
 * requirement, so it is refused outright; resolve it against source and record it as RESOLVED
 * with the reference that resolved it. Refusals are typed (GraphifyPolicyError) so a caller
 * can tell a policy decision from a crash.
 */

/** The extractor version whose output this harness understands. Any other index is ignored. */
export const GRAPHIFY_EXTRACTOR_VERSION = "graphify/1";

/** Edge kinds an index may declare. Anything else is unrecognised, never assumed resolved. */
export const GRAPHIFY_EDGE_KINDS = Object.freeze(["RESOLVED", "INFERRED"] as const);

export type GraphifyEdgeKind = (typeof GRAPHIFY_EDGE_KINDS)[number];

const EDGE_KINDS: ReadonlySet<string> = new Set<string>(GRAPHIFY_EDGE_KINDS);

/** A content hash is only meaningful if it is a sha256 digest; any other shape proves nothing. */
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

/** One dependency edge. A RESOLVED edge carries the source reference that resolved it. */
export interface GraphifyEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: GraphifyEdgeKind;
  readonly sourceRef?: string;
}

/** A code-only index of one repository at one commit. */
export interface GraphifyIndex {
  readonly repository: string;
  readonly commitSha: string;
  readonly extractorVersion: string;
  readonly contentHash: string;
  readonly edges: readonly GraphifyEdge[];
}

/** The repository and commit actually under review, which an index must match exactly. */
export interface GraphifyIndexBinding {
  readonly repository: string;
  readonly commitSha: string;
}

/**
 * The verdict on an index. `evidence` is structurally `false`: there is no input, and no
 * combination of inputs, for which Graphify output becomes evidence. `reason` is present
 * exactly when the index was ignored, so an ignored index always records why.
 */
export interface GraphifyIndexVerdict {
  readonly usable: boolean;
  readonly evidence: false;
  readonly reason?: string;
}

/** A Graphify input was refused by policy, as opposed to being malformed at the type level. */
export class GraphifyPolicyError extends Error {
  readonly violation: string;

  constructor(violation: string, message: string) {
    super(message);
    this.name = "GraphifyPolicyError";
    this.violation = violation;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ignored(reason: string): GraphifyIndexVerdict {
  return Object.freeze({ usable: false, evidence: false, reason });
}

/**
 * Decides whether an index may inform context for the commit under review.
 *
 * Accepts `unknown` deliberately: a missing index is the common case, and degrading to
 * "no context" is the correct outcome rather than a thrown error, for any JSON-derived value.
 * Reasons name the policy that rejected the index and never echo its contents back, so a
 * reason is safe to log.
 */
export function evaluateGraphifyIndex(index: unknown, binding: GraphifyIndexBinding): GraphifyIndexVerdict {
  if (!isRecord(index)) return ignored("no index: absent, null or not an object");
  if (index.repository !== binding.repository) return ignored("index repository is not the repository under review");
  if (index.commitSha !== binding.commitSha) return ignored("index commitSha is not the commit under review");
  if (index.extractorVersion !== GRAPHIFY_EXTRACTOR_VERSION) {
    return ignored(`index extractorVersion is not ${GRAPHIFY_EXTRACTOR_VERSION}`);
  }
  if (typeof index.contentHash !== "string" || !CONTENT_HASH.test(index.contentHash)) {
    return ignored("index contentHash is absent, malformed, empty or not a sha256 digest");
  }
  if (!Array.isArray(index.edges)) return ignored("index edges is not an array");
  return Object.freeze({ usable: true, evidence: false });
}

/**
 * Refuses any edge that cannot justify a decision on its own, with a typed error naming the
 * violation. A non-object, a malformed endpoint and an unrecognised kind are all refused the
 * same way as an INFERRED edge, so for any JSON-derived edge a caller sees a GraphifyPolicyError
 * rather than a raw TypeError (see the module header for the bound on that guarantee).
 */
export function assertEdgeUsable(edge: unknown): asserts edge is GraphifyEdge {
  if (!isRecord(edge)) {
    throw new GraphifyPolicyError("edge-not-an-object", "a Graphify edge must be an object");
  }
  if (typeof edge.from !== "string" || edge.from.length === 0 || typeof edge.to !== "string" || edge.to.length === 0) {
    throw new GraphifyPolicyError("edge-endpoints", "a Graphify edge must name a non-empty from and to");
  }
  if (typeof edge.kind !== "string" || !EDGE_KINDS.has(edge.kind)) {
    throw new GraphifyPolicyError(
      "edge-unknown-kind",
      `unrecognised edge kind; expected one of ${GRAPHIFY_EDGE_KINDS.join(", ")}`
    );
  }
  if (edge.kind === "INFERRED") {
    throw new GraphifyPolicyError(
      "inferred-edge",
      "an INFERRED edge is context, never authority: verify it against source and record it as " +
        "RESOLVED with the sourceRef that resolved it"
    );
  }
  if (typeof edge.sourceRef !== "string" || edge.sourceRef.trim().length === 0) {
    throw new GraphifyPolicyError("edge-missing-source-ref", "a RESOLVED edge must carry a non-empty sourceRef");
  }
}
