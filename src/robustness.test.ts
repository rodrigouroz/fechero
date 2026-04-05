import { describe, expect, it } from "vitest";

import { parseSpanishDate } from "./index";

const context = {
  referenceDateTime: "2026-03-31T10:00:00-03:00",
  timezone: "America/Argentina/Buenos_Aires",
  locale: "es" as const,
};

describe("parseSpanishDate — new robustness & completeness", () => {
  it("rejects invalid reference datetime without throwing", () => {
    const result = parseSpanishDate("mañana", {
      ...context,
      referenceDateTime: "not-a-date",
    });
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "INVALID_REFERENCE_DATETIME" }),
    ]);
    expect(result.candidates).toEqual([]);
  });

  it("rejects unknown timezones", () => {
    const result = parseSpanishDate("mañana", {
      ...context,
      timezone: "Mars/Phobos",
    });
    expect(result.errors).toEqual([expect.objectContaining({ code: "INVALID_TIMEZONE" })]);
  });

  it("strict mode rejects typo-corrected inputs", () => {
    const result = parseSpanishDate("vierns", { ...context, mode: "strict" });
    expect(result.candidates).toEqual([]);
    expect(result.errors.some((error) => error.code === "STRICT_MODE_REJECTED")).toBe(true);
  });

  it("strict mode rejects ambiguous inputs", () => {
    const result = parseSpanishDate("próximo viernes", { ...context, mode: "strict" });
    expect(result.candidates).toEqual([]);
    expect(result.errors.some((error) => error.code === "STRICT_MODE_REJECTED")).toBe(true);
  });

  it("parses ISO numeric dates", () => {
    const result = parseSpanishDate("nos vemos 2026-04-09", context);
    expect(result.candidates[0]).toMatchObject({
      kind: "date",
      exactDate: "2026-04-09",
    });
  });

  it("parses DD/MM numeric dates", () => {
    const result = parseSpanishDate("reunión el 9/4", context);
    expect(result.candidates[0]).toMatchObject({
      kind: "date",
      exactDate: "2026-04-09",
    });
  });

  it("parses relative offsets 'en 3 días'", () => {
    const result = parseSpanishDate("en 3 días", context);
    expect(result.candidates[0]).toMatchObject({
      kind: "date",
      exactDate: "2026-04-03",
    });
  });

  it("parses mediodía as 12:00", () => {
    const result = parseSpanishDate("mañana al mediodía", context);
    expect(result.candidates[0]).toMatchObject({
      kind: "datetime",
      exactDate: "2026-04-01",
      exactStartTime: "12:00",
    });
  });

  it("emits two candidates for ambiguous hours like 'a las 3'", () => {
    const result = parseSpanishDate("mañana a las 3", context);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((candidate) => candidate.exactStartTime).sort()).toEqual([
      "03:00",
      "15:00",
    ]);
    expect(result.warnings.some((warning) => warning.code === "HOUR_AM_PM_AMBIGUOUS")).toBe(true);
  });

  it("disambiguates hours with afternoon context", () => {
    const result = parseSpanishDate("mañana a las 3 de la tarde", context);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      exactDate: "2026-04-01",
      exactStartTime: "15:00",
    });
  });

  it("parses 'y media' minutes", () => {
    const result = parseSpanishDate("mañana a las 14 y media", context);
    expect(result.candidates[0]).toMatchObject({
      exactDate: "2026-04-01",
      exactStartTime: "14:30",
    });
  });

  it("parses 'de 14 a 16' as a time range", () => {
    const result = parseSpanishDate("mañana de 14 a 16", context);
    expect(result.candidates[0]).toMatchObject({
      exactDate: "2026-04-01",
      timeRange: { from: "14:00", to: "16:00" },
    });
  });

  it("parses daily recurrence", () => {
    const result = parseSpanishDate("todos los días a las 9", context);
    expect(result.candidates[0]).toMatchObject({
      kind: "recurrence",
      recurrence: { frequency: "daily", interval: 1 },
      exactStartTime: "09:00",
    });
  });

  it("parses 'cada 2 semanas'", () => {
    const result = parseSpanishDate("cada 2 semanas", context);
    expect(result.candidates[0]).toMatchObject({
      kind: "recurrence",
      recurrence: { frequency: "weekly", interval: 2 },
    });
  });

  it("parses multi-weekday recurrence", () => {
    const result = parseSpanishDate("todos los lunes y miércoles", context);
    expect(result.candidates[0]).toMatchObject({
      kind: "recurrence",
      recurrence: { frequency: "weekly", interval: 1, weekdays: [1, 3] },
    });
  });

  it("parses weekday ranges 'de lunes a viernes'", () => {
    const result = parseSpanishDate("de lunes a viernes a la tarde", context);
    expect(result.candidates[0]).toMatchObject({
      kind: "availability_filter",
      allowedWeekdays: [1, 2, 3, 4, 5],
    });
  });

  it("parses weekday lists 'lunes y miércoles'", () => {
    const result = parseSpanishDate("lunes y miércoles", context);
    expect(result.candidates[0]).toMatchObject({
      allowedWeekdays: [1, 3],
    });
  });

  it("parses 'en abril' as a month range", () => {
    const result = parseSpanishDate("en abril", context);
    expect(result.candidates[0]).toMatchObject({
      kind: "date_range",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
    });
  });

  it("parses 'fin de mes'", () => {
    const result = parseSpanishDate("a fin de mes", context);
    expect(result.candidates[0]).toMatchObject({
      kind: "date_range",
      dateTo: "2026-03-31",
    });
  });

  it("parses ordinal weekday 'el primer lunes del mes'", () => {
    const result = parseSpanishDate("el primer lunes del mes", context);
    expect(result.candidates[0]).toMatchObject({
      kind: "date",
      exactDate: "2026-04-06",
    });
  });

  it("parses durations 'por 2 horas'", () => {
    const result = parseSpanishDate("mañana a las 15 por 2 horas", context);
    expect(result.candidates[0]).toMatchObject({
      exactDate: "2026-04-01",
      exactStartTime: "15:00",
      durationMinutes: 120,
    });
  });

  it("parses pure durations as a duration candidate", () => {
    const result = parseSpanishDate("por media hora", context);
    expect(result.candidates[0]).toMatchObject({
      kind: "duration",
      durationMinutes: 30,
    });
  });

  it("handles multi-clause inputs 'el lunes a las 10 y el jueves a las 15'", () => {
    const result = parseSpanishDate("el lunes a las 10 y el jueves a las 15", context);
    const dates = result.candidates.map((candidate) => candidate.exactDate).sort();
    expect(new Set(dates).size).toBeGreaterThanOrEqual(2);
    expect(dates).toContain("2026-04-06");
    expect(dates).toContain("2026-04-02");
  });

  it("attaches original-text coordinates to source spans when input has accents", () => {
    const result = parseSpanishDate("próximo viernes", context);
    // Normalized "proximo viernes" is one char longer than "próximo viernes" would be
    // if we had 2-byte accents, but "ó" is a single char in JS. The mapping should
    // still be consistent: any annotated originalStart must land inside the original.
    for (const candidate of result.candidates) {
      for (const span of candidate.sourceSpans ?? []) {
        if (span.originalStart !== undefined) {
          expect(span.originalStart).toBeGreaterThanOrEqual(0);
          expect(span.originalStart).toBeLessThan("próximo viernes".length);
        }
      }
    }
  });

  it("surfaces YEAR_INFERRED when the year is not given and the date rolls forward", () => {
    // 2026-01-15 is in the past relative to reference 2026-03-31.
    const result = parseSpanishDate("15 de enero", context);
    expect(result.candidates[0]).toMatchObject({ exactDate: "2027-01-15" });
    expect(result.warnings.some((warning) => warning.code === "YEAR_INFERRED")).toBe(true);
  });

  it("keeps ambiguous candidates sortable by resolveBestCandidate", () => {
    const result = parseSpanishDate("próximo viernes", context);
    expect(result.candidates).toHaveLength(2);
    // Nearest bias (default) should put 2026-04-03 ahead of 2026-04-10.
    const ordered = [...result.candidates].sort(
      (left, right) => right.confidence - left.confidence
    );
    expect(ordered[0].exactDate).toBe("2026-04-03");
  });
});
