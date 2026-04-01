import { Temporal } from "@js-temporal/polyfill";

import type { DateExpression, ParseContext, ParsedTemporalExpression, TemporalCandidate } from "./types";

function getReferenceDate(context: ParseContext): Temporal.PlainDate {
  return Temporal.Instant.from(context.referenceDateTime).toZonedDateTimeISO(context.timezone).toPlainDate();
}

function formatDate(date: Temporal.PlainDate): string {
  return date.toString();
}

function toCandidateTimeRange(expression: ParsedTemporalExpression["time"]) {
  if (!expression) {
    return undefined;
  }

  return {
    from: expression.from,
    to: expression.to,
    label: expression.label,
    precision: expression.precision,
  };
}

function nextOccurrence(referenceDate: Temporal.PlainDate, weekday: number): Temporal.PlainDate {
  const delta = (weekday - referenceDate.dayOfWeek + 7) % 7;
  const safeDelta = delta === 0 ? 7 : delta;
  return referenceDate.add({ days: safeDelta });
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

function dateCandidatesFromExpression(
  dateExpression: DateExpression,
  referenceDate: Temporal.PlainDate
): TemporalCandidate[] {
  if (dateExpression.kind === "relative_day") {
    return [
      {
        kind: "date",
        confidence: 1,
        exactDate: formatDate(referenceDate.add({ days: dateExpression.offsetDays })),
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

export function interpretTemporalExpression(
  expression: ParsedTemporalExpression,
  context: ParseContext
): TemporalCandidate[] {
  if (expression.recurrence) {
    return [
      {
        kind: "recurrence",
        confidence: 0.95,
        recurrence: expression.recurrence,
        timeRange: toCandidateTimeRange(expression.time),
      },
    ];
  }

  const referenceDate = getReferenceDate(context);
  const dateCandidates = expression.date
    ? dateCandidatesFromExpression(expression.date, referenceDate)
    : [];

  if (
    expression.negative &&
    expression.date?.kind === "weekday"
  ) {
    return [
      {
        kind: "availability_filter",
        confidence: 0.9,
        excludedWeekdays: [expression.date.weekday],
        timeRange: toCandidateTimeRange(expression.time),
      },
    ];
  }

  if (!expression.time) {
    return dateCandidates;
  }

  if (dateCandidates.length === 0) {
    return [
      {
        kind: "availability_filter",
        confidence: 0.85,
        timeRange: toCandidateTimeRange(expression.time),
      },
    ];
  }

  return dateCandidates.map((candidate) => ({
    ...candidate,
    kind: candidate.kind === "date_range" ? "availability_filter" : "datetime",
    timeRange: toCandidateTimeRange(expression.time),
  }));
}
