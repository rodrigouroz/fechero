import { Temporal } from "@js-temporal/polyfill";

import { resolveBestCandidate } from "./resolve";
import type { ParseResult, TemporalCandidate, TimeRange } from "./types";

type WeekdayConvention = "temporal" | "sunday-0";

type HelperOptions = {
  weekdayConvention?: WeekdayConvention;
};

type SchedulingFilter = {
  days_of_week?: number[];
  time_from?: string;
  time_to?: string;
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

function asCandidate(input: ParseResult | TemporalCandidate): TemporalCandidate | null {
  return "candidates" in input ? resolveBestCandidate(input) : input;
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

function timeRangeBounds(timeRange?: TimeRange) {
  if (!timeRange) {
    return {};
  }

  return {
    time_from: timeRange.from,
    time_to: timeRange.to,
  };
}

export function toAvailabilityFilters(
  input: ParseResult | TemporalCandidate,
  options: HelperOptions = {}
): SchedulingFilter[] {
  const candidate = asCandidate(input);
  if (!candidate) {
    return [];
  }

  const weekdayConvention = options.weekdayConvention ?? "temporal";
  const daysOfWeek = candidateWeekdays(candidate, weekdayConvention);

  if (!daysOfWeek && !candidate.timeRange) {
    return [];
  }

  return [
    {
      ...(daysOfWeek ? { days_of_week: daysOfWeek } : {}),
      ...timeRangeBounds(candidate.timeRange),
    },
  ];
}

export function toExclusionFilters(
  input: ParseResult | TemporalCandidate,
  options: HelperOptions = {}
): SchedulingFilter[] {
  const candidate = asCandidate(input);
  if (!candidate || !candidate.excludedWeekdays?.length) {
    return [];
  }

  const weekdayConvention = options.weekdayConvention ?? "temporal";

  return [
    {
      days_of_week: candidate.excludedWeekdays.map((weekday) =>
        convertWeekday(weekday, weekdayConvention)
      ),
      ...timeRangeBounds(candidate.timeRange),
    },
  ];
}

export function toTemporalConstraints(
  input: ParseResult | TemporalCandidate,
  options: HelperOptions = {}
): TemporalConstraints {
  const candidate = asCandidate(input);
  if (!candidate) {
    return {};
  }

  const weekdayConvention = options.weekdayConvention ?? "temporal";

  return {
    ...(candidate.exactDate ? { exactDate: candidate.exactDate } : {}),
    ...(candidate.exactStartTime ? { exactStartTime: candidate.exactStartTime } : {}),
    ...(candidate.timeRange
      ? {
          preferredTimeRange: {
            from: candidate.timeRange.from,
            to: candidate.timeRange.to,
          },
        }
      : {}),
    ...(candidate.allowedWeekdays?.length
      ? {
          allowedWeekdays: candidate.allowedWeekdays.map((weekday) =>
            convertWeekday(weekday, weekdayConvention)
          ),
        }
      : {}),
    ...(candidate.excludedWeekdays?.length
      ? {
          excludedWeekdays: candidate.excludedWeekdays.map((weekday) =>
            convertWeekday(weekday, weekdayConvention)
          ),
        }
      : {}),
  };
}
