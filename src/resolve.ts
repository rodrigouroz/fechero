import type { ParseResult, TemporalCandidate } from "./types";

export type ResolutionPolicy = {
  /**
   * When true, prefer candidates that carry an unambiguous `exactDate`
   * (literal_absolute) over inferred ones of equal confidence.
   */
  preferExact?: boolean;
  /**
   * Tie-breaker for ambiguous weekday expressions like `próximo viernes`.
   * `nearest` picks the upcoming occurrence, `farthest` the one one week out.
   * Defaults to `nearest`.
   */
  ambiguousWeekdayBias?: "nearest" | "farthest";
};

/**
 * Pick a single best candidate from a {@link ParseResult}.
 *
 * Returns `null` when no candidates were produced. Consumers that want to
 * expose ambiguity to the user should read `result.candidates` directly.
 */
export function resolveBestCandidate(
  result: ParseResult,
  policy: ResolutionPolicy = {}
): TemporalCandidate | null {
  if (result.candidates.length === 0) {
    return null;
  }

  if (result.candidates.length === 1) {
    return result.candidates[0];
  }

  const bias = policy.ambiguousWeekdayBias ?? "nearest";

  if (policy.preferExact) {
    const exact = result.candidates.find(
      (candidate) => candidate.exactDate && !candidate.ambiguityReason
    );
    if (exact) {
      return exact;
    }
  }

  const sorted = [...result.candidates].sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }
    // Same confidence, both with exactDate → apply weekday bias.
    if (left.exactDate && right.exactDate) {
      const leftDate = left.exactDate;
      const rightDate = right.exactDate;
      if (leftDate !== rightDate) {
        return bias === "nearest"
          ? leftDate.localeCompare(rightDate)
          : rightDate.localeCompare(leftDate);
      }
    }
    return 0;
  });

  return sorted[0] ?? null;
}
