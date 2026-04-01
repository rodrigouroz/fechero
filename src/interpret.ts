import { Temporal } from "@js-temporal/polyfill";

import type {
  DateExpression,
  DateRangeSource,
  ExactDateSource,
  ExactStartTimeSource,
  ParseContext,
  ParsedTemporalExpression,
  SelectionHints,
  TemporalCandidate,
} from "./types";

function getReferenceDate(context: ParseContext): Temporal.PlainDate {
  return Temporal.Instant.from(context.referenceDateTime)
    .toZonedDateTimeISO(context.timezone)
    .toPlainDate();
}

function formatDate(date: Temporal.PlainDate): string {
  return date.toString();
}

function toCandidateTimeRange(expression: ParsedTemporalExpression["time"]) {
  if (!expression || expression.kind !== "time_range") {
    return undefined;
  }

  return {
    from: expression.from,
    to: expression.to,
    label: expression.label,
    precision: expression.precision,
  };
}

function toExactStartTime(expression: ParsedTemporalExpression["time"]) {
  if (!expression || expression.kind !== "exact_time") {
    return undefined;
  }

  return expression.value;
}

function toExactStartTimeSource(
  expression: ParsedTemporalExpression["time"]
): ExactStartTimeSource | undefined {
  if (!expression || expression.kind !== "exact_time") {
    return undefined;
  }

  return expression.isApproximate ? "literal_approximate" : "literal_exact";
}

function toApproximationFlag(expression: ParsedTemporalExpression["time"]) {
  if (!expression || expression.kind !== "exact_time") {
    return undefined;
  }

  return expression.isApproximate;
}

function nextOccurrence(referenceDate: Temporal.PlainDate, weekday: number): Temporal.PlainDate {
  const delta = (weekday - referenceDate.dayOfWeek + 7) % 7;
  const safeDelta = delta === 0 ? 7 : delta;
  return referenceDate.add({ days: safeDelta });
}

function startOfCurrentWeek(referenceDate: Temporal.PlainDate): Temporal.PlainDate {
  return referenceDate.subtract({ days: referenceDate.dayOfWeek - 1 });
}

function startOfNextWeek(referenceDate: Temporal.PlainDate): Temporal.PlainDate {
  const deltaToMonday = ((8 - referenceDate.dayOfWeek) % 7) || 7;
  return referenceDate.add({ days: deltaToMonday });
}

function nextSaturday(referenceDate: Temporal.PlainDate): Temporal.PlainDate {
  const saturday = 6;
  const delta = (saturday - referenceDate.dayOfWeek + 7) % 7;
  return referenceDate.add({ days: delta === 0 ? 7 : delta });
}

function nextValidDayOfMonth(
  referenceDate: Temporal.PlainDate,
  day: number
): Temporal.PlainDate | undefined {
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
      return "literal_relative";
    case "weekday":
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
      return "literal_range";
    default:
      return undefined;
  }
}

function selectionHintsFromExpression(
  dateExpression?: DateExpression,
  timeExpression?: ParsedTemporalExpression["time"]
): SelectionHints {
  const mentionsExactDate =
    dateExpression?.kind === "absolute_date" ||
    dateExpression?.kind === "day_of_month" ||
    dateExpression?.kind === "relative_day";
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
    timeExpression?.kind === "time_range";

  return {
    mentionsExactDate,
    mentionsExactTime: timeExpression?.kind === "exact_time",
    mentionsRelativeWeekday,
    mentionsRange,
  };
}

function dateCandidatesFromExpression(
  dateExpression: DateExpression,
  referenceDate: Temporal.PlainDate
): TemporalCandidate[] {
  if (dateExpression.kind === "absolute_date") {
    const inferredYear = dateExpression.year ?? referenceDate.year;
    let exactDate = Temporal.PlainDate.from({
      year: inferredYear,
      month: dateExpression.month,
      day: dateExpression.day,
    });

    if (!dateExpression.year && Temporal.PlainDate.compare(exactDate, referenceDate) < 0) {
      exactDate = exactDate.add({ years: 1 });
    }

    return [
      {
        kind: "date",
        confidence: dateExpression.weekday ? 0.98 : 1,
        exactDate: formatDate(exactDate),
      },
    ];
  }

  if (dateExpression.kind === "day_of_month") {
    const exactDate = nextValidDayOfMonth(referenceDate, dateExpression.day);
    if (!exactDate) {
      return [];
    }

    return [
      {
        kind: "date",
        confidence: dateExpression.weekday ? 0.93 : 0.9,
        exactDate: formatDate(exactDate),
      },
    ];
  }

  if (dateExpression.kind === "relative_day") {
    return [
      {
        kind: "date",
        confidence: 1,
        exactDate: formatDate(referenceDate.add({ days: dateExpression.offsetDays })),
      },
    ];
  }

  if (dateExpression.kind === "current_week") {
    const dateFrom = startOfCurrentWeek(referenceDate);
    return [
      {
        kind: "date_range",
        confidence: 0.98,
        dateFrom: formatDate(dateFrom),
        dateTo: formatDate(dateFrom.add({ days: 6 })),
      },
    ];
  }

  if (dateExpression.kind === "next_week") {
    const dateFrom = startOfNextWeek(referenceDate);
    return [
      {
        kind: "date_range",
        confidence: 0.95,
        dateFrom: formatDate(dateFrom),
        dateTo: formatDate(dateFrom.add({ days: 6 })),
      },
    ];
  }

  if (dateExpression.kind === "week_after_next") {
    const dateFrom = startOfNextWeek(referenceDate).add({ days: 7 });
    return [
      {
        kind: "date_range",
        confidence: 0.95,
        dateFrom: formatDate(dateFrom),
        dateTo: formatDate(dateFrom.add({ days: 6 })),
      },
    ];
  }

  if (dateExpression.kind === "weekend") {
    const saturday = nextSaturday(referenceDate);
    return [
      {
        kind: "date_range",
        confidence: 0.95,
        dateFrom: formatDate(saturday),
        dateTo: formatDate(saturday.add({ days: 1 })),
      },
    ];
  }

  if (dateExpression.kind === "this_weekday") {
    const weekStart = startOfCurrentWeek(referenceDate);
    return [
      {
        kind: "date",
        confidence: 0.95,
        exactDate: formatDate(weekStart.add({ days: dateExpression.weekday - 1 })),
      },
    ];
  }

  if (dateExpression.kind === "next_week_weekday") {
    const weekStart = startOfNextWeek(referenceDate);
    return [
      {
        kind: "date",
        confidence: 0.95,
        exactDate: formatDate(weekStart.add({ days: dateExpression.weekday - 1 })),
      },
    ];
  }

  if (dateExpression.kind === "weekday") {
    return [
      {
        kind: "date",
        confidence: 0.9,
        exactDate: formatDate(nextOccurrence(referenceDate, dateExpression.weekday)),
      },
    ];
  }

  const upcoming = nextOccurrence(referenceDate, dateExpression.weekday);
  const following = upcoming.add({ days: 7 });

  return [
    {
      kind: "date",
      confidence: 0.55,
      exactDate: formatDate(upcoming),
      ambiguityReason: "proximo_weekday",
    },
    {
      kind: "date",
      confidence: 0.45,
      exactDate: formatDate(following),
      ambiguityReason: "proximo_weekday",
    },
  ];
}

function applySemanticMetadata(
  candidate: TemporalCandidate,
  options: {
    dateExpression?: DateExpression;
    timeExpression?: ParsedTemporalExpression["time"];
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
      ? {
          exactStartTimeSource: toExactStartTimeSource(options.timeExpression),
        }
      : {}),
    selectionHints: selectionHintsFromExpression(
      options.dateExpression,
      options.timeExpression
    ),
    sourceSpans: options.sourceSpans,
  };
}

export function interpretTemporalExpression(
  expression: ParsedTemporalExpression,
  context: ParseContext
): TemporalCandidate[] {
  const referenceDate = getReferenceDate(context);

  if (expression.recurrence) {
    const recurrenceStartCandidates = expression.recurrenceStart
      ? dateCandidatesFromExpression(expression.recurrenceStart, referenceDate)
      : [undefined];

    return recurrenceStartCandidates.map((startCandidate) =>
      applySemanticMetadata(
        {
          kind: "recurrence",
          confidence: startCandidate?.confidence ?? 0.95,
          recurrence: expression.recurrence,
          exactStartTime: toExactStartTime(expression.time),
          isApproximate: toApproximationFlag(expression.time),
          timeRange: toCandidateTimeRange(expression.time),
          ...(startCandidate?.exactDate ? { exactDate: startCandidate.exactDate } : {}),
          ...(startCandidate?.dateFrom ? { dateFrom: startCandidate.dateFrom } : {}),
          ...(startCandidate?.dateTo ? { dateTo: startCandidate.dateTo } : {}),
          ...(startCandidate?.ambiguityReason
            ? { ambiguityReason: startCandidate.ambiguityReason }
            : {}),
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

  if (
    expression.negative &&
    expression.date &&
    ["weekday", "this_weekday", "next_week_weekday"].includes(expression.date.kind)
  ) {
    const weekday =
      expression.date.kind === "weekday" ||
      expression.date.kind === "this_weekday" ||
      expression.date.kind === "next_week_weekday"
        ? expression.date.weekday
        : undefined;

    return [
      applySemanticMetadata(
        {
          kind: "availability_filter",
          confidence: 0.9,
          excludedWeekdays: weekday ? [weekday] : undefined,
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

  if (!expression.time) {
    return dateCandidates.map((candidate) =>
      applySemanticMetadata(candidate, {
        dateExpression: expression.date,
        timeExpression: expression.time,
        sourceSpans: expression.sourceSpans,
      })
    );
  }

  if (dateCandidates.length === 0) {
    return [
      applySemanticMetadata(
        {
          kind: "availability_filter",
          confidence: 0.85,
          exactStartTime: toExactStartTime(expression.time),
          isApproximate: toApproximationFlag(expression.time),
          timeRange: toCandidateTimeRange(expression.time),
        },
        {
          timeExpression: expression.time,
          sourceSpans: expression.sourceSpans,
        }
      ),
    ];
  }

  return dateCandidates.map((candidate) =>
    applySemanticMetadata(
      {
        ...candidate,
        kind: candidate.kind === "date_range" ? "availability_filter" : "datetime",
        exactStartTime: toExactStartTime(expression.time),
        isApproximate: toApproximationFlag(expression.time),
        timeRange: toCandidateTimeRange(expression.time),
      },
      {
        dateExpression: expression.date,
        timeExpression: expression.time,
        sourceSpans: expression.sourceSpans,
      }
    )
  );
}
