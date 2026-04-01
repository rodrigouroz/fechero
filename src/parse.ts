import { detectTemporalExpression } from "./detect";
import { interpretTemporalExpression } from "./interpret";
import { normalizeInput } from "./normalize";
import type { ParseContext, ParseError, ParseResult } from "./types";

export function parseSpanishDate(input: string, context: ParseContext): ParseResult {
  const normalized = normalizeInput(input);
  const expression = detectTemporalExpression(normalized.normalizedText, normalized.corrections);
  const candidates = interpretTemporalExpression(expression, context);

  const errors: ParseError[] =
    candidates.length === 0
      ? [
          {
            code: "NO_TEMPORAL_EXPRESSION",
            message: "No temporal expression could be parsed from the input.",
          },
        ]
      : [];

  return {
    normalizedText: normalized.normalizedText,
    corrections: normalized.corrections,
    candidates,
    warnings: [],
    errors,
  };
}
