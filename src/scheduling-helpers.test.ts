import { describe, expect, it } from "vitest";

import {
  parseSpanishDate,
  toAvailabilityFilters,
  toExclusionFilters,
  toTemporalConstraints,
} from "./index";

const context = {
  referenceDateTime: "2026-03-31T10:00:00-03:00",
  timezone: "America/Argentina/Buenos_Aires",
  locale: "es" as const,
};

describe("Scheduling helpers", () => {
  it("maps exact date and exact time into generic temporal constraints", () => {
    const parsed = parseSpanishDate("9 de abril a las 16:30", context);

    expect(
      toTemporalConstraints(parsed, {
        weekdayConvention: "sunday-0",
      })
    ).toEqual({
      exactDate: "2026-04-09",
      exactStartTime: "16:30",
    });
  });

  it("maps named ranges into availability filters", () => {
    const parsed = parseSpanishDate("este jueves a la tarde", context);

    expect(
      toAvailabilityFilters(parsed, {
        weekdayConvention: "sunday-0",
      })
    ).toEqual([
      {
        days_of_week: [4],
        time_from: "13:00",
        time_to: "19:00",
      },
    ]);
  });

  it("maps exclusions using a configurable weekday numbering", () => {
    const parsed = parseSpanishDate("excepto los domingos", context);

    expect(
      toExclusionFilters(parsed, {
        weekdayConvention: "sunday-0",
      })
    ).toEqual([
      {
        days_of_week: [0],
      },
    ]);
  });
});
