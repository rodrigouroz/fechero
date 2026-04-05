import { Temporal } from "@js-temporal/polyfill";

import { detectTemporalExpression } from "./detect";
import { interpretTemporalExpression } from "./interpret";
import { normalizeInput } from "./normalize";
import type {
  NormalizedInput,
  ParseContext,
  ParseError,
  ParseResult,
  ParseWarning,
  SourceSpan,
  TemporalCandidate,
} from "./types";

/**
 * Annotate each span with `originalStart` / `originalEnd` using the
 * normalize-step index map.
 */
function annotateSpansWithOriginal(
  spans: SourceSpan[] | undefined,
  normalized: NormalizedInput
): SourceSpan[] | undefined {
  if (!spans) return spans;
  const map = normalized.normalizedToOriginal;
  return spans.map((span) => {
    if (span.start < 0 || span.end > map.length) return span;
    const originalStart = map[span.start];
    const lastCharIndex = Math.max(span.start, span.end - 1);
    const originalEndInclusive = map[lastCharIndex] ?? originalStart;
    const originalEnd = originalEndInclusive + 1;
    // Only attach original-coordinate fields when the mapping is not an
    // identity of (start, end, text). This keeps the default output stable
    // and backwards compatible.
    const originalText =
      originalStart !== undefined && originalEnd !== undefined
        ? normalized.originalText.slice(originalStart, originalEnd)
        : undefined;
    if (originalStart === span.start && originalEnd === span.end && originalText === span.text) {
      return span;
    }
    return {
      ...span,
      ...(originalText !== undefined ? { originalText } : {}),
      ...(originalStart !== undefined ? { originalStart } : {}),
      ...(originalEnd !== undefined ? { originalEnd } : {}),
    };
  });
}

const MULTI_CLAUSE_SPLITTERS = [/\s+y\s+/u, /;\s+/u, /,\s+/u];

type Clause = { text: string; offset: number };

function splitClauses(normalizedText: string): Clause[] | undefined {
  for (const separator of MULTI_CLAUSE_SPLITTERS) {
    // Use matchAll to get split positions as well as the pieces.
    const globalSeparator = new RegExp(separator.source, "gu");
    const pieces: Clause[] = [];
    let cursor = 0;
    for (const match of normalizedText.matchAll(globalSeparator)) {
      const end = match.index ?? 0;
      const text = normalizedText.slice(cursor, end).trim();
      if (text.length > 0) {
        const offset = normalizedText.indexOf(text, cursor);
        pieces.push({ text, offset: offset < 0 ? cursor : offset });
      }
      cursor = end + match[0].length;
    }
    const tail = normalizedText.slice(cursor).trim();
    if (tail.length > 0) {
      const offset = normalizedText.indexOf(tail, cursor);
      pieces.push({ text: tail, offset: offset < 0 ? cursor : offset });
    }
    if (pieces.length >= 2 && pieces.length <= 4) {
      return pieces;
    }
  }
  return undefined;
}

function shiftSpans(candidate: TemporalCandidate, offset: number): TemporalCandidate {
  if (!candidate.sourceSpans || offset === 0) return candidate;
  return {
    ...candidate,
    sourceSpans: candidate.sourceSpans.map((span) => ({
      ...span,
      start: span.start + offset,
      end: span.end + offset,
    })),
  };
}

function tryMultiClauseParse(
  normalizedText: string,
  context: ParseContext,
  singleShot: TemporalCandidate[]
): TemporalCandidate[] | undefined {
  // If the single-shot result already understood the input as a weekday list
  // or range, don't second-guess it.
  if (
    singleShot.some(
      (candidate) =>
        candidate.allowedWeekdays !== undefined || candidate.excludedWeekdays !== undefined
    )
  ) {
    return undefined;
  }

  const parts = splitClauses(normalizedText);
  if (!parts) return undefined;

  const perPart: TemporalCandidate[][] = [];
  for (const part of parts) {
    const partExpression = detectTemporalExpression(part.text);
    const partCandidates = interpretTemporalExpression(partExpression, context);
    // Each part must resolve to at least one candidate with an exactDate.
    // Otherwise, " y " is probably part of a single expression ("lunes y
    // miércoles", "entre 3 y 5", "3 y media", etc.).
    if (partCandidates.length === 0) return undefined;
    const hasConcreteDate = partCandidates.some(
      (candidate) => candidate.exactDate || (candidate.dateFrom && candidate.dateTo)
    );
    if (!hasConcreteDate) return undefined;
    // Shift each part's source spans so they reference positions in the full
    // normalized text, not the partial clause text.
    perPart.push(partCandidates.map((candidate) => shiftSpans(candidate, part.offset)));
  }

  // Require at least two distinct exactDate values across the parts; otherwise
  // the split is not carrying new information vs the single-shot parse.
  const exactDates = new Set<string>();
  for (const candidates of perPart) {
    for (const candidate of candidates) {
      if (candidate.exactDate) exactDates.add(candidate.exactDate);
    }
  }
  if (exactDates.size < 2) return undefined;

  // If the single-shot already covered all the clause-level dates, keep it.
  const singleDates = new Set(singleShot.map((candidate) => candidate.exactDate).filter(Boolean));
  if (
    [...exactDates].every((date) => singleDates.has(date ?? "")) &&
    singleShot.length >= perPart.length
  ) {
    return undefined;
  }

  return perPart.flat();
}

function annotateCandidates(
  candidates: TemporalCandidate[],
  normalized: NormalizedInput
): TemporalCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    sourceSpans: annotateSpansWithOriginal(candidate.sourceSpans, normalized),
  }));
}

function validateContext(context: ParseContext): ParseError[] {
  const errors: ParseError[] = [];
  let instant: Temporal.Instant | undefined;
  try {
    instant = Temporal.Instant.from(context.referenceDateTime);
  } catch {
    errors.push({
      code: "INVALID_REFERENCE_DATETIME",
      message: `referenceDateTime is not a valid ISO-8601 instant: ${context.referenceDateTime}`,
    });
  }
  if (instant) {
    try {
      // Throws if the timezone is unknown.
      instant.toZonedDateTimeISO(context.timezone);
    } catch {
      errors.push({
        code: "INVALID_TIMEZONE",
        message: `timezone is not a known IANA timezone: ${context.timezone}`,
      });
    }
  }
  return errors;
}

function deriveWarnings(input: {
  context: ParseContext;
  expression: ReturnType<typeof detectTemporalExpression>;
  result: ParseResult;
}): ParseWarning[] {
  const warnings: ParseWarning[] = [...input.result.warnings];

  // Collect per-candidate warnings once.
  for (const candidate of input.result.candidates) {
    if (candidate.warnings) {
      for (const warning of candidate.warnings) {
        if (!warnings.some((existing) => existing.code === warning.code)) {
          warnings.push(warning);
        }
      }
    }
  }

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

/**
 * Parse an informal Spanish temporal expression into a deterministic
 * {@link ParseResult}.
 *
 * The parser never throws on well-formed {@link ParseContext} arguments: every
 * problem is reported through `result.errors` or `result.warnings`. Call with
 * `context.mode = "strict"` to reject typo-corrected or ambiguous inputs.
 *
 * @example
 * ```ts
 * parseSpanishDate("mañana a las 15", {
 *   referenceDateTime: "2026-03-31T10:00:00-03:00",
 *   timezone: "America/Argentina/Buenos_Aires",
 *   locale: "es-AR",
 * });
 * ```
 */
export function parseSpanishDate(input: string, context: ParseContext): ParseResult {
  const contextErrors = validateContext(context);
  if (contextErrors.length > 0) {
    return {
      normalizedText: "",
      originalText: input,
      corrections: [],
      candidates: [],
      warnings: [],
      errors: contextErrors,
    };
  }

  const normalized = normalizeInput(input);
  const expression = detectTemporalExpression(normalized.normalizedText, normalized.corrections);
  const singleShot = interpretTemporalExpression(expression, context);

  // Multi-clause handling: if the single-shot path produced at most one
  // datetime candidate but the input looks like two temporal clauses joined
  // by " y " / ", " / "; ", try parsing each half independently and merging
  // distinct datetime candidates.
  const multiShot = tryMultiClauseParse(normalized.normalizedText, context, singleShot);
  const rawCandidates = multiShot ?? singleShot;
  const candidates = annotateCandidates(rawCandidates, normalized);

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
    originalText: normalized.originalText,
    corrections: normalized.corrections,
    candidates,
    warnings: [],
    errors,
  };

  const result: ParseResult = {
    ...baseResult,
    warnings: deriveWarnings({
      context,
      expression,
      result: baseResult,
    }),
  };

  // Strict mode: reject typo corrections and ambiguous candidate sets.
  if (context.mode === "strict") {
    const strictErrors: ParseError[] = [];
    if (result.corrections.some((correction) => correction.reason === "typo")) {
      strictErrors.push({
        code: "STRICT_MODE_REJECTED",
        message: "Strict mode rejected a typo-corrected token.",
      });
    }
    if (result.candidates.length > 1) {
      strictErrors.push({
        code: "STRICT_MODE_REJECTED",
        message: "Strict mode rejected an ambiguous input with multiple candidates.",
      });
    }
    if (strictErrors.length > 0) {
      return {
        ...result,
        candidates: [],
        errors: [...result.errors, ...strictErrors],
      };
    }
  }

  return result;
}
