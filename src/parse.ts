import { Temporal } from "@js-temporal/polyfill";

import { detectTemporalExpression } from "./detect";
import { interpretTemporalExpression } from "./interpret";
import { normalizeInput } from "./normalize";
import type { ParseContext, ParseError, ParseResult } from "./types";

function deriveWarnings(input: {
  context: ParseContext;
  expression: ReturnType<typeof detectTemporalExpression>;
  result: ParseResult;
}) {
  const warnings = [...input.result.warnings];
  const absoluteDate =
    input.expression.date?.kind === "absolute_date"
      ? input.expression.date
      : input.expression.recurrenceStart?.kind === "absolute_date"
        ? input.expression.recurrenceStart
        : undefined;
  const firstCandidate = input.result.candidates[0];

  if (absoluteDate?.weekday && firstCandidate?.exactDate) {
    const actualWeekday = Temporal.PlainDate.from(firstCandidate.exactDate).dayOfWeek;
    if (actualWeekday !== absoluteDate.weekday) {
      warnings.push({
        code: "WEEKDAY_DATE_MISMATCH",
        message: "El día de la semana no coincide con la fecha absoluta.",
      });
    }
  }

  return warnings;
}

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

  const baseResult: ParseResult = {
    normalizedText: normalized.normalizedText,
    corrections: normalized.corrections,
    candidates,
    warnings: [],
    errors,
  };

  return {
    ...baseResult,
    warnings: deriveWarnings({
      context,
      expression,
      result: baseResult,
    }),
  };
}
