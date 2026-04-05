import { Temporal } from "@js-temporal/polyfill";

import type {
  DateExpression,
  DateRangeSource,
  ExactDateSource,
  ExactStartTimeSource,
  ParseContext,
  ParsedTemporalExpression,
  ParseWarning,
  SelectionHints,
  TemporalCandidate,
  TimeExpression,
} from "./types";

// ---------------------------------------------------------------------------
// Context / reference
// ---------------------------------------------------------------------------

function getReferenceDate(context: ParseContext): Temporal.PlainDate {
  return Temporal.Instant.from(context.referenceDateTime)
    .toZonedDateTimeISO(context.timezone)
    .toPlainDate();
}

function formatDate(date: Temporal.PlainDate): string {
  return date.toString();
}

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

function toCandidateTimeRange(expression: TimeExpression | undefined) {
  if (!expression || expression.kind !== "time_range") return undefined;
  return {
    from: expression.from,
    to: expression.to,
    label: expression.label,
    precision: expression.precision,
  };
}

function toExactStartTime(expression: TimeExpression | undefined) {
  if (!expression || expression.kind !== "exact_time") return undefined;
  return expression.value;
}

function toExactStartTimeSource(
  expression: TimeExpression | undefined
): ExactStartTimeSource | undefined {
  if (!expression || expression.kind !== "exact_time") return undefined;
  return expression.isApproximate ? "literal_approximate" : "literal_exact";
}

function toApproximationFlag(expression: TimeExpression | undefined) {
  if (!expression || expression.kind !== "exact_time") return undefined;
  return expression.isApproximate;
}

// ---------------------------------------------------------------------------
// Calendar math helpers
// ---------------------------------------------------------------------------

function nextOccurrence(referenceDate: Temporal.PlainDate, weekday: number): Temporal.PlainDate {
  const delta = (weekday - referenceDate.dayOfWeek + 7) % 7;
  const safeDelta = delta === 0 ? 7 : delta;
  return referenceDate.add({ days: safeDelta });
}

function startOfCurrentWeek(referenceDate: Temporal.PlainDate): Temporal.PlainDate {
  return referenceDate.subtract({ days: referenceDate.dayOfWeek - 1 });
}

function startOfNextWeek(referenceDate: Temporal.PlainDate): Temporal.PlainDate {
  const deltaToMonday = (8 - referenceDate.dayOfWeek) % 7 || 7;
  return referenceDate.add({ days: deltaToMonday });
}

function nextSaturday(referenceDate: Temporal.PlainDate): Temporal.PlainDate {
  const saturday = 6;
  const delta = (saturday - referenceDate.dayOfWeek + 7) % 7;
  return referenceDate.add({ days: delta === 0 ? 7 : delta });
}

function lastDayOfMonth(referenceDate: Temporal.PlainDate): Temporal.PlainDate {
  return Temporal.PlainDate.from({
    year: referenceDate.year,
    month: referenceDate.month,
    day: referenceDate.daysInMonth,
  });
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  ordinal: number,
  weekday: number
): Temporal.PlainDate | undefined {
  if (ordinal === -1) {
    const last = Temporal.PlainDate.from({
      year,
      month,
      day: Temporal.PlainDate.from({ year, month, day: 1 }).daysInMonth,
    });
    const delta = (last.dayOfWeek - weekday + 7) % 7;
    return last.subtract({ days: delta });
  }

  const firstOfMonth = Temporal.PlainDate.from({ year, month, day: 1 });
  const firstDelta = (weekday - firstOfMonth.dayOfWeek + 7) % 7;
  const day = 1 + firstDelta + (ordinal - 1) * 7;
  try {
    return Temporal.PlainDate.from({ year, month, day });
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

function exactDateSourceFromExpression(
  dateExpression: DateExpression
): ExactDateSource | undefined {
  switch (dateExpression.kind) {
    case "absolute_date":
    case "day_of_month":
      return "literal_absolute";
    case "relative_day":
    case "this_weekday":
    case "next_week_weekday":
    case "ambiguous_next_weekday":
    case "in_days":
    case "in_weeks":
    case "in_months":
      return "literal_relative";
    case "weekday":
    case "nth_weekday_of_month":
    case "end_of_month":
    case "start_of_month":
    case "mid_month":
      return "inferred";
    default:
      return undefined;
  }
}

function dateRangeSourceFromExpression(
  dateExpression: DateExpression
): DateRangeSource | undefined {
  switch (dateExpression.kind) {
    case "current_week":
    case "next_week":
    case "week_after_next":
    case "weekend":
    case "current_month":
    case "next_month":
    case "month_of_year":
    case "weekday_range":
      return "literal_range";
    default:
      return undefined;
  }
}

function selectionHintsFromExpression(
  dateExpression?: DateExpression,
  timeExpression?: TimeExpression
): SelectionHints {
  const mentionsExactDate =
    dateExpression?.kind === "absolute_date" ||
    dateExpression?.kind === "day_of_month" ||
    dateExpression?.kind === "relative_day" ||
    dateExpression?.kind === "in_days";
  const mentionsRelativeWeekday =
    dateExpression?.kind === "weekday" ||
    dateExpression?.kind === "this_weekday" ||
    dateExpression?.kind === "next_week_weekday" ||
    dateExpression?.kind === "ambiguous_next_weekday";
  const mentionsRange =
    dateExpression?.kind === "current_week" ||
    dateExpression?.kind === "next_week" ||
    dateExpression?.kind === "week_after_next" ||
    dateExpression?.kind === "weekend" ||
    dateExpression?.kind === "current_month" ||
    dateExpression?.kind === "next_month" ||
    dateExpression?.kind === "month_of_year" ||
    dateExpression?.kind === "weekday_range" ||
    timeExpression?.kind === "time_range";

  return {
    mentionsExactDate,
    mentionsExactTime: timeExpression?.kind === "exact_time",
    mentionsRelativeWeekday,
    mentionsRange,
  };
}

// ---------------------------------------------------------------------------
// Date-kind resolution
// ---------------------------------------------------------------------------

type DateCandidate = {
  candidate: TemporalCandidate;
  warnings?: ParseWarning[];
};

function dateCandidatesFromExpression(
  dateExpression: DateExpression,
  referenceDate: Temporal.PlainDate
): DateCandidate[] {
  if (dateExpression.kind === "absolute_date") {
    const inferredYear = dateExpression.year ?? referenceDate.year;
    let exactDate: Temporal.PlainDate;
    try {
      exactDate = Temporal.PlainDate.from({
        year: inferredYear,
        month: dateExpression.month,
        day: dateExpression.day,
      });
    } catch {
      return [
        {
          candidate: {
            kind: "date",
            confidence: 0,
            ambiguityReason: "invalid_day_of_month",
          },
          warnings: [],
        },
      ];
    }

    const warnings: ParseWarning[] = [];
    if (!dateExpression.year && Temporal.PlainDate.compare(exactDate, referenceDate) < 0) {
      exactDate = exactDate.add({ years: 1 });
      warnings.push({
        code: "YEAR_INFERRED",
        message: "El año no fue especificado y se asumió el siguiente válido.",
      });
    }

    return [
      {
        candidate: {
          kind: "date",
          confidence: dateExpression.weekday ? 0.98 : 1,
          exactDate: formatDate(exactDate),
        },
        warnings,
      },
    ];
  }

  if (dateExpression.kind === "day_of_month") {
    const exactDate = nextValidDayOfMonth(referenceDate, dateExpression.day);
    if (!exactDate) {
      return [
        {
          candidate: {
            kind: "date",
            confidence: 0,
            ambiguityReason: "invalid_day_of_month",
          },
        },
      ];
    }

    return [
      {
        candidate: {
          kind: "date",
          confidence: dateExpression.weekday ? 0.93 : 0.9,
          exactDate: formatDate(exactDate),
        },
      },
    ];
  }

  if (dateExpression.kind === "relative_day") {
    return [
      {
        candidate: {
          kind: "date",
          confidence: 1,
          exactDate: formatDate(referenceDate.add({ days: dateExpression.offsetDays })),
        },
      },
    ];
  }

  if (dateExpression.kind === "in_days") {
    return [
      {
        candidate: {
          kind: "date",
          confidence: 0.97,
          exactDate: formatDate(referenceDate.add({ days: dateExpression.days })),
        },
      },
    ];
  }

  if (dateExpression.kind === "in_weeks") {
    return [
      {
        candidate: {
          kind: "date",
          confidence: 0.92,
          exactDate: formatDate(referenceDate.add({ weeks: dateExpression.weeks })),
        },
      },
    ];
  }

  if (dateExpression.kind === "in_months") {
    return [
      {
        candidate: {
          kind: "date",
          confidence: 0.9,
          exactDate: formatDate(referenceDate.add({ months: dateExpression.months })),
        },
      },
    ];
  }

  if (dateExpression.kind === "current_week") {
    const dateFrom = startOfCurrentWeek(referenceDate);
    return [
      {
        candidate: {
          kind: "date_range",
          confidence: 0.98,
          dateFrom: formatDate(dateFrom),
          dateTo: formatDate(dateFrom.add({ days: 6 })),
        },
      },
    ];
  }

  if (dateExpression.kind === "next_week") {
    const dateFrom = startOfNextWeek(referenceDate);
    return [
      {
        candidate: {
          kind: "date_range",
          confidence: 0.95,
          dateFrom: formatDate(dateFrom),
          dateTo: formatDate(dateFrom.add({ days: 6 })),
        },
      },
    ];
  }

  if (dateExpression.kind === "week_after_next") {
    const dateFrom = startOfNextWeek(referenceDate).add({ days: 7 });
    return [
      {
        candidate: {
          kind: "date_range",
          confidence: 0.95,
          dateFrom: formatDate(dateFrom),
          dateTo: formatDate(dateFrom.add({ days: 6 })),
        },
      },
    ];
  }

  if (dateExpression.kind === "weekend") {
    const saturday = nextSaturday(referenceDate);
    return [
      {
        candidate: {
          kind: "date_range",
          confidence: 0.95,
          dateFrom: formatDate(saturday),
          dateTo: formatDate(saturday.add({ days: 1 })),
        },
      },
    ];
  }

  if (dateExpression.kind === "this_weekday") {
    const weekStart = startOfCurrentWeek(referenceDate);
    return [
      {
        candidate: {
          kind: "date",
          confidence: 0.95,
          exactDate: formatDate(weekStart.add({ days: dateExpression.weekday - 1 })),
        },
      },
    ];
  }

  if (dateExpression.kind === "next_week_weekday") {
    const weekStart = startOfNextWeek(referenceDate);
    return [
      {
        candidate: {
          kind: "date",
          confidence: 0.95,
          exactDate: formatDate(weekStart.add({ days: dateExpression.weekday - 1 })),
        },
      },
    ];
  }

  if (dateExpression.kind === "weekday") {
    return [
      {
        candidate: {
          kind: "date",
          confidence: 0.9,
          exactDate: formatDate(nextOccurrence(referenceDate, dateExpression.weekday)),
        },
      },
    ];
  }

  if (dateExpression.kind === "weekdays") {
    return [
      {
        candidate: {
          kind: "date_range",
          confidence: 0.85,
          allowedWeekdays: dateExpression.weekdays,
        },
      },
    ];
  }

  if (dateExpression.kind === "weekday_range") {
    const allowed: number[] = [];
    const start = dateExpression.fromWeekday;
    const end = dateExpression.toWeekday;
    if (start <= end) {
      for (let weekday = start; weekday <= end; weekday += 1) allowed.push(weekday);
    } else {
      for (let weekday = start; weekday <= 7; weekday += 1) allowed.push(weekday);
      for (let weekday = 1; weekday <= end; weekday += 1) allowed.push(weekday);
    }
    return [
      {
        candidate: {
          kind: "date_range",
          confidence: 0.9,
          allowedWeekdays: allowed,
        },
      },
    ];
  }

  if (dateExpression.kind === "current_month") {
    const first = Temporal.PlainDate.from({
      year: referenceDate.year,
      month: referenceDate.month,
      day: 1,
    });
    return [
      {
        candidate: {
          kind: "date_range",
          confidence: 0.92,
          dateFrom: formatDate(first),
          dateTo: formatDate(lastDayOfMonth(referenceDate)),
        },
      },
    ];
  }

  if (dateExpression.kind === "next_month") {
    const next = referenceDate.add({ months: 1 });
    const first = Temporal.PlainDate.from({ year: next.year, month: next.month, day: 1 });
    return [
      {
        candidate: {
          kind: "date_range",
          confidence: 0.92,
          dateFrom: formatDate(first),
          dateTo: formatDate(lastDayOfMonth(next)),
        },
      },
    ];
  }

  if (dateExpression.kind === "month_of_year") {
    let year = dateExpression.year ?? referenceDate.year;
    let first = Temporal.PlainDate.from({ year, month: dateExpression.month, day: 1 });
    const warnings: ParseWarning[] = [];
    if (
      !dateExpression.year &&
      Temporal.PlainDate.compare(first, referenceDate.subtract({ days: 1 })) < 0
    ) {
      year += 1;
      first = Temporal.PlainDate.from({ year, month: dateExpression.month, day: 1 });
      warnings.push({
        code: "YEAR_INFERRED",
        message: "El año no fue especificado y se asumió el siguiente válido.",
      });
    }
    const last = Temporal.PlainDate.from({
      year,
      month: dateExpression.month,
      day: first.daysInMonth,
    });
    return [
      {
        candidate: {
          kind: "date_range",
          confidence: 0.9,
          dateFrom: formatDate(first),
          dateTo: formatDate(last),
        },
        warnings,
      },
    ];
  }

  if (dateExpression.kind === "end_of_month") {
    const last = lastDayOfMonth(referenceDate);
    return [
      {
        candidate: {
          kind: "date_range",
          confidence: 0.85,
          dateFrom: formatDate(last.subtract({ days: 4 })),
          dateTo: formatDate(last),
        },
      },
    ];
  }

  if (dateExpression.kind === "start_of_month") {
    const first = Temporal.PlainDate.from({
      year: referenceDate.year,
      month: referenceDate.month,
      day: 1,
    });
    return [
      {
        candidate: {
          kind: "date_range",
          confidence: 0.85,
          dateFrom: formatDate(first),
          dateTo: formatDate(first.add({ days: 4 })),
        },
      },
    ];
  }

  if (dateExpression.kind === "mid_month") {
    const mid = Temporal.PlainDate.from({
      year: referenceDate.year,
      month: referenceDate.month,
      day: 15,
    });
    return [
      {
        candidate: {
          kind: "date_range",
          confidence: 0.8,
          dateFrom: formatDate(mid.subtract({ days: 2 })),
          dateTo: formatDate(mid.add({ days: 2 })),
        },
      },
    ];
  }

  if (dateExpression.kind === "nth_weekday_of_month") {
    const targetMonth = dateExpression.month ?? referenceDate.month;
    const targetYear = referenceDate.year;
    const date = nthWeekdayOfMonth(
      targetYear,
      targetMonth,
      dateExpression.ordinal,
      dateExpression.weekday
    );
    if (!date) return [];
    const resolved =
      Temporal.PlainDate.compare(date, referenceDate) < 0
        ? nthWeekdayOfMonth(
            targetYear,
            targetMonth === 12 ? 1 : targetMonth + 1,
            dateExpression.ordinal,
            dateExpression.weekday
          )
        : date;
    if (!resolved) return [];
    return [
      {
        candidate: {
          kind: "date",
          confidence: 0.88,
          exactDate: formatDate(resolved),
        },
      },
    ];
  }

  // ambiguous_next_weekday — emit two candidates.
  const upcoming = nextOccurrence(referenceDate, dateExpression.weekday);
  const following = upcoming.add({ days: 7 });

  return [
    {
      candidate: {
        kind: "date",
        confidence: 0.55,
        exactDate: formatDate(upcoming),
        ambiguityReason: "proximo_weekday",
      },
    },
    {
      candidate: {
        kind: "date",
        confidence: 0.45,
        exactDate: formatDate(following),
        ambiguityReason: "proximo_weekday",
      },
    },
  ];
}

function nextValidDayOfMonth(
  referenceDate: Temporal.PlainDate,
  day: number
): Temporal.PlainDate | undefined {
  if (day < 1 || day > 31) return undefined;
  for (let monthOffset = 0; monthOffset < 24; monthOffset += 1) {
    const candidateMonth = referenceDate.add({ months: monthOffset });
    try {
      const candidate = Temporal.PlainDate.from({
        year: candidateMonth.year,
        month: candidateMonth.month,
        day,
      });
      if (Temporal.PlainDate.compare(candidate, referenceDate) >= 0) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Hour AM/PM expansion
// ---------------------------------------------------------------------------

function expandHourAmbiguity(time: TimeExpression | undefined): {
  times: TimeExpression[];
  isAmbiguous: boolean;
} {
  if (!time || time.kind !== "exact_time" || !time.hourAmbiguous) {
    return { times: time ? [time] : [], isAmbiguous: false };
  }

  const [hourStr, minuteStr] = time.value.split(":");
  const hour = Number.parseInt(hourStr, 10);
  const minutes = minuteStr;
  const amValue = `${String(hour % 12).padStart(2, "0")}:${minutes}`;
  const pmValue = `${String((hour % 12) + 12).padStart(2, "0")}:${minutes}`;

  return {
    times: [
      { kind: "exact_time", value: amValue, isApproximate: time.isApproximate },
      { kind: "exact_time", value: pmValue, isApproximate: time.isApproximate },
    ],
    isAmbiguous: true,
  };
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

function applySemanticMetadata(
  candidate: TemporalCandidate,
  options: {
    dateExpression?: DateExpression;
    timeExpression?: TimeExpression;
    sourceSpans: ParsedTemporalExpression["sourceSpans"];
  }
): TemporalCandidate {
  const exactDateSource =
    candidate.exactDate && options.dateExpression
      ? exactDateSourceFromExpression(options.dateExpression)
      : undefined;
  const dateRangeSource =
    candidate.dateFrom && candidate.dateTo && options.dateExpression
      ? dateRangeSourceFromExpression(options.dateExpression)
      : undefined;

  return {
    ...candidate,
    ...(exactDateSource ? { exactDateSource } : {}),
    ...(dateRangeSource ? { dateRangeSource } : {}),
    ...(candidate.exactStartTime
      ? { exactStartTimeSource: toExactStartTimeSource(options.timeExpression) }
      : {}),
    selectionHints: selectionHintsFromExpression(options.dateExpression, options.timeExpression),
    sourceSpans: options.sourceSpans,
  };
}

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------

/**
 * Resolve a {@link ParsedTemporalExpression} against `context` and produce one
 * or more {@link TemporalCandidate}s.
 *
 * This function is deterministic and performs no IO. All ambiguity is
 * preserved as separate candidates; downstream `resolveBestCandidate` or
 * `toTemporalOutput` decide whether to collapse.
 */
export function interpretTemporalExpression(
  expression: ParsedTemporalExpression,
  context: ParseContext
): TemporalCandidate[] {
  const referenceDate = getReferenceDate(context);

  // Duration-only expressions (e.g. "por 2 horas").
  if (expression.duration && !expression.date && !expression.time && !expression.recurrence) {
    return [
      applySemanticMetadata(
        {
          kind: "duration",
          confidence: 0.9,
          durationMinutes: expression.duration.minutes,
        },
        {
          sourceSpans: expression.sourceSpans,
        }
      ),
    ];
  }

  if (expression.recurrence) {
    const recurrenceStartCandidates: Array<{
      candidate: TemporalCandidate | undefined;
      warnings?: ParseWarning[];
    }> = expression.recurrenceStart
      ? dateCandidatesFromExpression(expression.recurrenceStart, referenceDate)
      : [{ candidate: undefined }];

    return recurrenceStartCandidates.map(({ candidate: startCandidate, warnings }) =>
      applySemanticMetadata(
        {
          kind: "recurrence",
          confidence: startCandidate?.confidence ?? 0.95,
          recurrence: expression.recurrence,
          exactStartTime: toExactStartTime(expression.time),
          isApproximate: toApproximationFlag(expression.time),
          timeRange: toCandidateTimeRange(expression.time),
          ...(expression.duration ? { durationMinutes: expression.duration.minutes } : {}),
          ...(startCandidate?.exactDate ? { exactDate: startCandidate.exactDate } : {}),
          ...(startCandidate?.dateFrom ? { dateFrom: startCandidate.dateFrom } : {}),
          ...(startCandidate?.dateTo ? { dateTo: startCandidate.dateTo } : {}),
          ...(startCandidate?.ambiguityReason
            ? { ambiguityReason: startCandidate.ambiguityReason }
            : {}),
          ...(warnings && warnings.length > 0 ? { warnings } : {}),
        },
        {
          dateExpression: expression.recurrenceStart,
          timeExpression: expression.time,
          sourceSpans: expression.sourceSpans,
        }
      )
    );
  }

  const dateCandidates = expression.date
    ? dateCandidatesFromExpression(expression.date, referenceDate)
    : [];

  // Surface INVALID_DAY_OF_MONTH as an actual zero-candidate result, so that
  // parse() converts it to an error.
  const hasInvalidDay = dateCandidates.some(
    ({ candidate }) => candidate.ambiguityReason === "invalid_day_of_month"
  );
  if (hasInvalidDay) {
    // Replace candidates with an empty list; parse() will emit a specific
    // error via the warnings path instead.
    return [];
  }

  // Negative handling — broaden to cover any date expression.
  if (expression.negative && expression.date) {
    const kind = expression.date.kind;

    // Weekday-style negatives: exclude the weekday.
    if (
      kind === "weekday" ||
      kind === "this_weekday" ||
      kind === "next_week_weekday" ||
      kind === "ambiguous_next_weekday"
    ) {
      const weekday = (expression.date as { weekday: number }).weekday;
      return [
        applySemanticMetadata(
          {
            kind: "availability_filter",
            confidence: 0.9,
            excludedWeekdays: [weekday],
            exactStartTime: toExactStartTime(expression.time),
            isApproximate: toApproximationFlag(expression.time),
            timeRange: toCandidateTimeRange(expression.time),
          },
          {
            dateExpression: expression.date,
            timeExpression: expression.time,
            sourceSpans: expression.sourceSpans,
          }
        ),
      ];
    }

    if (kind === "weekdays") {
      return [
        applySemanticMetadata(
          {
            kind: "availability_filter",
            confidence: 0.9,
            excludedWeekdays: (expression.date as { weekdays: number[] }).weekdays,
            exactStartTime: toExactStartTime(expression.time),
            isApproximate: toApproximationFlag(expression.time),
            timeRange: toCandidateTimeRange(expression.time),
          },
          {
            dateExpression: expression.date,
            timeExpression: expression.time,
            sourceSpans: expression.sourceSpans,
          }
        ),
      ];
    }

    // Date-style negatives ("mañana no puedo", "el 9 de abril no"): exclude
    // the specific date.
    const excluded = dateCandidates
      .map(({ candidate }) => candidate.exactDate)
      .filter((value): value is string => Boolean(value));
    if (excluded.length > 0) {
      return [
        applySemanticMetadata(
          {
            kind: "availability_filter",
            confidence: 0.88,
            excludedDates: excluded,
            exactStartTime: toExactStartTime(expression.time),
            isApproximate: toApproximationFlag(expression.time),
            timeRange: toCandidateTimeRange(expression.time),
          },
          {
            dateExpression: expression.date,
            timeExpression: expression.time,
            sourceSpans: expression.sourceSpans,
          }
        ),
      ];
    }
  }

  if (!expression.time && !expression.duration) {
    return dateCandidates.map(({ candidate, warnings }) =>
      applySemanticMetadata(
        {
          ...candidate,
          ...(warnings && warnings.length > 0 ? { warnings } : {}),
        },
        {
          dateExpression: expression.date,
          timeExpression: expression.time,
          sourceSpans: expression.sourceSpans,
        }
      )
    );
  }

  // Expand AM/PM ambiguity into multiple candidates if necessary.
  const { times, isAmbiguous } = expandHourAmbiguity(expression.time);
  const ambiguityWarnings: ParseWarning[] = isAmbiguous
    ? [
        {
          code: "HOUR_AM_PM_AMBIGUOUS",
          message: "La hora es ambigua entre AM y PM sin contexto. Se emiten dos candidatos.",
        },
      ]
    : [];

  if (dateCandidates.length === 0) {
    // No date → time-only availability filter(s), one per AM/PM branch.
    if (times.length === 0) {
      return [];
    }
    return times.map((time) =>
      applySemanticMetadata(
        {
          kind: "availability_filter",
          confidence: isAmbiguous ? 0.6 : 0.85,
          exactStartTime: toExactStartTime(time),
          isApproximate: toApproximationFlag(time),
          timeRange: toCandidateTimeRange(time),
          ...(isAmbiguous ? { ambiguityReason: "hour_am_pm" } : {}),
          ...(ambiguityWarnings.length > 0 ? { warnings: ambiguityWarnings } : {}),
          ...(expression.duration ? { durationMinutes: expression.duration.minutes } : {}),
        },
        {
          timeExpression: time,
          sourceSpans: expression.sourceSpans,
        }
      )
    );
  }

  const combined: TemporalCandidate[] = [];
  for (const { candidate, warnings } of dateCandidates) {
    // Each date × each am/pm branch.
    const effectiveTimes = times.length === 0 ? [undefined] : times;
    for (const time of effectiveTimes) {
      const combinedWarnings: ParseWarning[] = [...(warnings ?? []), ...ambiguityWarnings];
      combined.push(
        applySemanticMetadata(
          {
            ...candidate,
            kind: candidate.kind === "date_range" ? "availability_filter" : "datetime",
            confidence: isAmbiguous ? candidate.confidence * 0.7 : candidate.confidence,
            exactStartTime: toExactStartTime(time),
            isApproximate: toApproximationFlag(time),
            timeRange: toCandidateTimeRange(time),
            ...(expression.duration ? { durationMinutes: expression.duration.minutes } : {}),
            ...(isAmbiguous
              ? {
                  ambiguityReason: candidate.ambiguityReason ?? "hour_am_pm",
                }
              : {}),
            ...(combinedWarnings.length > 0 ? { warnings: combinedWarnings } : {}),
          },
          {
            dateExpression: expression.date,
            timeExpression: time,
            sourceSpans: expression.sourceSpans,
          }
        )
      );
    }
  }

  return combined;
}
