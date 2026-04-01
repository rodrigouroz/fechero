import type { ParseResult, TemporalCandidate } from "./types";

export type ResolutionPolicy = {
  preferExact?: boolean;
};

export function resolveBestCandidate(
  result: ParseResult,
  policy: ResolutionPolicy = {}
): TemporalCandidate | null {
  if (result.candidates.length === 0) {
    return null;
  }

  if (policy.preferExact) {
    const exact = result.candidates.find((candidate) => candidate.exactDate && !candidate.ambiguityReason);
    if (exact) {
      return exact;
    }
  }

  return [...result.candidates].sort((left, right) => right.confidence - left.confidence)[0] ?? null;
}
