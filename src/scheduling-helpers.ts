import { Temporal } from "@js-temporal/polyfill";

import { resolveBestCandidate } from "./resolve";
import type {
  DateRangeSource,
  ExactDateSource,
  ExactStartTimeSource,
  ParseResult,
  ParseWarning,
  SelectionHints,
  SourceSpan,
  TemporalCandidate,
  TimeRange,
} from "./types";

export type WeekdayConvention = "temporal" | "sunday-0";

export type HelperOptions = {
  weekdayConvention?: WeekdayConvention;
  preserveAmbiguity?: boolean;
};

export type TemporalRule = {
  weekdays?: number[];
  timeFrom?: string;
  timeTo?: string;
};

export type TemporalOutput = {
  ambiguous: boolean;
  ambiguityReason?: string;
  exactDate?: string;
  exactDateSource?: ExactDateSource;
  exactStartTime?: string;
  exactStartTimeSource?: ExactStartTimeSource;
  isApproximate?: boolean;
  dateFrom?: string;
  dateTo?: string;
  dateRangeSource?: DateRangeSource;
  availabilityRules: TemporalRule[];
  exclusionRules: TemporalRule[];
  recurrence?: {
    frequency: "daily" | "weekly" | "monthly";
    interval: number;
    weekdays?: number[];
  };
  selectionHints: SelectionHints;
  sourceSpans: SourceSpan[];
  warnings: ParseWarning[];
};

type TemporalConstraints = {
  exactDate?: string;
  exactStartTime?: string;
  preferredTimeRange?: {
    from: string;
    to: string;
  };
  allowedWeekdays?: number[];
  excludedWeekdays?: number[];
};

function defaultSelectionHints(): SelectionHints {
  return {
    mentionsExactDate: false,
    mentionsExactTime: false,
    mentionsRelativeWeekday: false,
    mentionsRange: false,
  };
}

function convertWeekday(weekday: number, convention: WeekdayConvention): number {
  if (convention === "temporal") {
    return weekday;
  }

  return weekday === 7 ? 0 : weekday;
}

function candidateWeekdays(
  candidate: TemporalCandidate,
  convention: WeekdayConvention
): number[] | undefined {
  if (candidate.allowedWeekdays?.length) {
    return candidate.allowedWeekdays.map((weekday) => convertWeekday(weekday, convention));
  }

  if (candidate.exactDate) {
    const weekday = Temporal.PlainDate.from(candidate.exactDate).dayOfWeek;
    return [convertWeekday(weekday, convention)];
  }

  return undefined;
}

function rangeRule(timeRange?: TimeRange): Pick<TemporalRule, "timeFrom" | "timeTo"> {
  if (!timeRange) {
    return {};
  }

  return {
    timeFrom: timeRange.from,
    timeTo: timeRange.to,
  };
}

function buildAvailabilityRules(
  candidate: TemporalCandidate,
  options: { weekdayConvention: WeekdayConvention }
): TemporalRule[] {
  if (candidate.excludedWeekdays?.length) {
    return [];
  }

  if (candidate.exactStartTime) {
    return [];
  }

  if (!candidate.timeRange) {
    return [];
  }

  const weekdays = candidate.exactDate
    ? undefined
    : candidateWeekdays(candidate, options.weekdayConvention);

  return [
    {
      ...(weekdays ? { weekdays } : {}),
      ...rangeRule(candidate.timeRange),
    },
  ];
}

function buildExclusionRules(
  candidate: TemporalCandidate,
  options: { weekdayConvention: WeekdayConvention }
): TemporalRule[] {
  if (!candidate.excludedWeekdays?.length) {
    return [];
  }

  return [
    {
      weekdays: candidate.excludedWeekdays.map((weekday) =>
        convertWeekday(weekday, options.weekdayConvention)
      ),
      ...rangeRule(candidate.timeRange),
    },
  ];
}

function recurrenceForOutput(
  candidate: TemporalCandidate,
  convention: WeekdayConvention
): TemporalOutput["recurrence"] {
  if (!candidate.recurrence) {
    return undefined;
  }

  return {
    ...candidate.recurrence,
    weekdays: candidate.recurrence.weekdays?.map((weekday) =>
      convertWeekday(weekday, convention)
    ),
  };
}

function ambiguityReason(candidates: TemporalCandidate[]): string | undefined {
  if (candidates.length < 2) {
    return undefined;
  }

  const reasons = new Set(
    candidates.map((candidate) => candidate.ambiguityReason).filter(Boolean)
  );
  if (reasons.size === 1) {
    return [...reasons][0];
  }

  return "multiple_candidates";
}

function sharedField<T>(
  candidates: TemporalCandidate[],
  getValue: (candidate: TemporalCandidate) => T | undefined
) {
  const values = candidates.map(getValue);
  const first = values[0];
  if (first === undefined) {
    return undefined;
  }

  return values.every((value) => JSON.stringify(value) === JSON.stringify(first))
    ? first
    : undefined;
}

function mergeSelectionHints(candidates: TemporalCandidate[]): SelectionHints {
  return candidates.reduce(
    (accumulator, candidate) => {
      const hints = candidate.selectionHints ?? defaultSelectionHints();

      return {
        mentionsExactDate: accumulator.mentionsExactDate || hints.mentionsExactDate,
        mentionsExactTime: accumulator.mentionsExactTime || hints.mentionsExactTime,
        mentionsRelativeWeekday:
          accumulator.mentionsRelativeWeekday || hints.mentionsRelativeWeekday,
        mentionsRange: accumulator.mentionsRange || hints.mentionsRange,
      };
    },
    defaultSelectionHints()
  );
}

function mergeSourceSpans(candidates: TemporalCandidate[]): SourceSpan[] {
  const seen = new Set<string>();

  return candidates
    .flatMap((candidate) => candidate.sourceSpans ?? [])
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .filter((span) => {
      const key = `${span.start}:${span.end}:${span.text}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function outputFromCandidate(
  candidate: TemporalCandidate,
  input: ParseResult,
  weekdayConvention: WeekdayConvention
): TemporalOutput {
  return {
    ambiguous: input.candidates.length > 1,
    ambiguityReason: ambiguityReason(input.candidates),
    ...(candidate.exactDate ? { exactDate: candidate.exactDate } : {}),
    ...(candidate.exactDateSource ? { exactDateSource: candidate.exactDateSource } : {}),
    ...(candidate.exactStartTime ? { exactStartTime: candidate.exactStartTime } : {}),
    ...(candidate.exactStartTimeSource
      ? { exactStartTimeSource: candidate.exactStartTimeSource }
      : {}),
    ...(candidate.isApproximate !== undefined ? { isApproximate: candidate.isApproximate } : {}),
    ...(candidate.dateFrom ? { dateFrom: candidate.dateFrom } : {}),
    ...(candidate.dateTo ? { dateTo: candidate.dateTo } : {}),
    ...(candidate.dateRangeSource ? { dateRangeSource: candidate.dateRangeSource } : {}),
    availabilityRules: buildAvailabilityRules(candidate, { weekdayConvention }),
    exclusionRules: buildExclusionRules(candidate, { weekdayConvention }),
    ...(candidate.recurrence
      ? {
          recurrence: recurrenceForOutput(candidate, weekdayConvention),
        }
      : {}),
    selectionHints: candidate.selectionHints ?? defaultSelectionHints(),
    sourceSpans: candidate.sourceSpans ?? [],
    warnings: input.warnings,
  };
}

export function toTemporalOutput(
  input: ParseResult,
  options: HelperOptions = {}
): TemporalOutput {
  const weekdayConvention = options.weekdayConvention ?? "temporal";
  const ambiguous = input.candidates.length > 1;
  const preserveAmbiguity = options.preserveAmbiguity ?? true;

  if (ambiguous && preserveAmbiguity) {
    return {
      ambiguous: true,
      ambiguityReason: ambiguityReason(input.candidates),
      exactDate: sharedField(input.candidates, (candidate) => candidate.exactDate),
      exactDateSource: sharedField(input.candidates, (candidate) => candidate.exactDateSource),
      exactStartTime: sharedField(input.candidates, (candidate) => candidate.exactStartTime),
      exactStartTimeSource: sharedField(input.candidates, (candidate) => candidate.exactStartTimeSource),
      isApproximate: sharedField(input.candidates, (candidate) => candidate.isApproximate),
      dateFrom: sharedField(input.candidates, (candidate) => candidate.dateFrom),
      dateTo: sharedField(input.candidates, (candidate) => candidate.dateTo),
      dateRangeSource: sharedField(input.candidates, (candidate) => candidate.dateRangeSource),
      availabilityRules: [],
      exclusionRules: [],
      recurrence: sharedField(input.candidates, (candidate) =>
        recurrenceForOutput(candidate, weekdayConvention)
      ),
      selectionHints: mergeSelectionHints(input.candidates),
      sourceSpans: mergeSourceSpans(input.candidates),
      warnings: input.warnings,
    };
  }

  const candidate =
    input.candidates.length === 0
      ? null
      : ambiguous
        ? resolveBestCandidate(input)
        : input.candidates[0];

  if (!candidate) {
    return {
      ambiguous,
      ambiguityReason: ambiguityReason(input.candidates),
      availabilityRules: [],
      exclusionRules: [],
      selectionHints: defaultSelectionHints(),
      sourceSpans: [],
      warnings: input.warnings,
    };
  }

  return outputFromCandidate(candidate, input, weekdayConvention);
}

export function toAvailabilityFilters(
  input: ParseResult,
  options: HelperOptions = {}
): Array<{ days_of_week?: number[]; time_from?: string; time_to?: string }> {
  return toTemporalOutput(input, options).availabilityRules.map((rule) => ({
    ...(rule.weekdays ? { days_of_week: rule.weekdays } : {}),
    ...(rule.timeFrom ? { time_from: rule.timeFrom } : {}),
    ...(rule.timeTo ? { time_to: rule.timeTo } : {}),
  }));
}

export function toExclusionFilters(
  input: ParseResult,
  options: HelperOptions = {}
): Array<{ days_of_week?: number[]; time_from?: string; time_to?: string }> {
  return toTemporalOutput(input, options).exclusionRules.map((rule) => ({
    ...(rule.weekdays ? { days_of_week: rule.weekdays } : {}),
    ...(rule.timeFrom ? { time_from: rule.timeFrom } : {}),
    ...(rule.timeTo ? { time_to: rule.timeTo } : {}),
  }));
}

export function toTemporalConstraints(
  input: ParseResult,
  options: HelperOptions = {}
): TemporalConstraints {
  const output = toTemporalOutput(input, options);

  return {
    ...(output.exactDate ? { exactDate: output.exactDate } : {}),
    ...(output.exactStartTime ? { exactStartTime: output.exactStartTime } : {}),
    ...(output.availabilityRules[0]?.timeFrom && output.availabilityRules[0]?.timeTo
      ? {
          preferredTimeRange: {
            from: output.availabilityRules[0].timeFrom,
            to: output.availabilityRules[0].timeTo,
          },
        }
      : {}),
    ...(output.availabilityRules[0]?.weekdays
      ? {
          allowedWeekdays: output.availabilityRules[0].weekdays,
        }
      : {}),
    ...(output.exclusionRules[0]?.weekdays
      ? {
          excludedWeekdays: output.exclusionRules[0].weekdays,
        }
      : {}),
  };
}
