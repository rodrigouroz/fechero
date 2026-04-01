import { describe, expect, it } from "vitest";

import { parseSpanishDate, toTemporalOutput } from "./index";

const context = {
  referenceDateTime: "2026-03-31T10:00:00-03:00",
  timezone: "America/Argentina/Buenos_Aires",
  locale: "es" as const,
};

describe("toTemporalOutput", () => {
  it("maps tomorrow into an exact date output", () => {
    const parsed = parseSpanishDate("mañana", context);

    expect(toTemporalOutput(parsed)).toEqual({
      ambiguous: false,
      exactDate: "2026-04-01",
      availabilityRules: [],
      exclusionRules: [],
      warnings: [],
    });
  });

  it("maps absolute datetime requests into exact date and exact time", () => {
    const parsed = parseSpanishDate("9 de abril a las 16:30", context);

    expect(toTemporalOutput(parsed)).toEqual({
      ambiguous: false,
      exactDate: "2026-04-09",
      exactStartTime: "16:30",
      isApproximate: false,
      availabilityRules: [],
      exclusionRules: [],
      warnings: [],
    });
  });

  it("maps broad date ranges without collapsing them", () => {
    const parsed = parseSpanishDate("la semana que viene", context);

    expect(toTemporalOutput(parsed)).toEqual({
      ambiguous: false,
      dateFrom: "2026-04-06",
      dateTo: "2026-04-12",
      availabilityRules: [],
      exclusionRules: [],
      warnings: [],
    });
  });

  it("preserves exact date plus include rules for time ranges", () => {
    const parsed = parseSpanishDate("el jueves a la tarde", context);

    expect(toTemporalOutput(parsed)).toEqual({
      ambiguous: false,
      exactDate: "2026-04-02",
      availabilityRules: [
        {
          timeFrom: "13:00",
          timeTo: "19:00",
        },
      ],
      exclusionRules: [],
      warnings: [],
    });
  });

  it("maps exclusions into exclusion rules", () => {
    const parsed = parseSpanishDate("los martes a la mañana no puedo", context);

    expect(
      toTemporalOutput(parsed, {
        weekdayConvention: "sunday-0",
      })
    ).toEqual({
      ambiguous: false,
      availabilityRules: [],
      exclusionRules: [
        {
          weekdays: [2],
          timeFrom: "08:00",
          timeTo: "12:00",
        },
      ],
      warnings: [],
    });
  });

  it("maps recurrence without forcing filters", () => {
    const parsed = parseSpanishDate("todos los martes", context);

    expect(
      toTemporalOutput(parsed, {
        weekdayConvention: "sunday-0",
      })
    ).toEqual({
      ambiguous: false,
      availabilityRules: [],
      exclusionRules: [],
      recurrence: {
        frequency: "weekly",
        interval: 1,
        weekdays: [2],
      },
      warnings: [],
    });
  });

  it("does not collapse ambiguity by default", () => {
    const parsed = parseSpanishDate("próximo viernes", context);

    expect(toTemporalOutput(parsed)).toEqual({
      ambiguous: true,
      ambiguityReason: "proximo_weekday",
      availabilityRules: [],
      exclusionRules: [],
      warnings: [],
    });
  });

  it("can resolve ambiguity only when preserveAmbiguity is false", () => {
    const parsed = parseSpanishDate("próximo viernes", context);

    expect(
      toTemporalOutput(parsed, {
        preserveAmbiguity: false,
      })
    ).toEqual({
      ambiguous: true,
      ambiguityReason: "proximo_weekday",
      exactDate: "2026-04-03",
      availabilityRules: [],
      exclusionRules: [],
      warnings: [],
    });
  });

  it("preserves approximate exact times in the unified output", () => {
    const parsed = parseSpanishDate("mañana tipo 3", context);

    expect(toTemporalOutput(parsed)).toEqual({
      ambiguous: false,
      exactDate: "2026-04-01",
      exactStartTime: "15:00",
      isApproximate: true,
      availabilityRules: [],
      exclusionRules: [],
      warnings: [],
    });
  });

  it("surfaces parse warnings like weekday/date mismatches", () => {
    const parsed = parseSpanishDate("martes 9 de abril de 2026", context);

    expect(toTemporalOutput(parsed)).toEqual({
      ambiguous: false,
      exactDate: "2026-04-09",
      availabilityRules: [],
      exclusionRules: [],
      warnings: [
        {
          code: "WEEKDAY_DATE_MISMATCH",
          message: "The weekday does not match the absolute date.",
        },
      ],
    });
  });
});
