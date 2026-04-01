import { describe, expect, it } from "vitest";

import { parseSpanishDate } from "./index";

const context = {
  referenceDateTime: "2026-03-31T10:00:00-03:00",
  timezone: "America/Argentina/Buenos_Aires",
  locale: "es-AR" as const,
};

describe("parseSpanishDate", () => {
  it("parses a relative day plus a named time range", () => {
    const result = parseSpanishDate("mañana a la tarde", context);

    expect(result.errors).toEqual([]);
    expect(result.corrections).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      kind: "datetime",
      exactDate: "2026-04-01",
      timeRange: {
        from: "13:00",
        to: "19:00",
        label: "tarde",
        precision: "coarse",
      },
    });
  });

  it("parses broad relative ranges like la semana que viene", () => {
    const result = parseSpanishDate("la semana que viene", context);

    expect(result.errors).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      kind: "date_range",
      dateFrom: "2026-04-06",
      dateTo: "2026-04-12",
    });
  });

  it("records conservative typo normalization before parsing", () => {
    const result = parseSpanishDate("prox martes", context);

    expect(result.normalizedText).toBe("proximo martes");
    expect(result.corrections).toEqual([
      {
        from: "prox",
        to: "proximo",
        reason: "abbreviation",
      },
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      kind: "date",
      exactDate: "2026-04-07",
    });
  });

  it("keeps multiple candidates for ambiguous próximo viernes", () => {
    const result = parseSpanishDate("próximo viernes", context);

    expect(result.errors).toEqual([]);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "date",
          exactDate: "2026-04-03",
          ambiguityReason: "proximo_weekday",
        }),
        expect.objectContaining({
          kind: "date",
          exactDate: "2026-04-10",
          ambiguityReason: "proximo_weekday",
        }),
      ])
    );
  });

  it("parses fuzzy typo variants like mñana", () => {
    const result = parseSpanishDate("mñana", context);

    expect(result.normalizedText).toBe("manana");
    expect(result.corrections).toEqual([
      {
        from: "mnana",
        to: "manana",
        reason: "typo",
      },
    ]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        kind: "date",
        exactDate: "2026-04-01",
      }),
    ]);
  });

  it("parses shorthand weekend aliases like finde", () => {
    const result = parseSpanishDate("finde", context);

    expect(result.errors).toEqual([]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        kind: "date_range",
        dateFrom: "2026-04-04",
        dateTo: "2026-04-05",
      }),
    ]);
  });

  it("parses a standalone named time range as an availability filter", () => {
    const result = parseSpanishDate("a la mañana", context);

    expect(result.errors).toEqual([]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        kind: "availability_filter",
        timeRange: {
          from: "08:00",
          to: "12:00",
          label: "manana",
          precision: "coarse",
        },
      }),
    ]);
  });

  it("parses relative expressions like pasado mañana", () => {
    const result = parseSpanishDate("pasado mañana", context);

    expect(result.errors).toEqual([]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        kind: "date",
        exactDate: "2026-04-02",
      }),
    ]);
  });

  it("parses recurring weekly requests", () => {
    const result = parseSpanishDate("todos los martes", context);

    expect(result.errors).toEqual([]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        kind: "recurrence",
        recurrence: {
          frequency: "weekly",
          interval: 1,
          weekdays: [2],
        },
      }),
    ]);
  });

  it("keeps time ranges attached to recurring requests", () => {
    const result = parseSpanishDate("todos los martes a la tarde", context);

    expect(result.errors).toEqual([]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        kind: "recurrence",
        recurrence: {
          frequency: "weekly",
          interval: 1,
          weekdays: [2],
        },
        timeRange: {
          from: "13:00",
          to: "19:00",
          label: "tarde",
          precision: "coarse",
        },
      }),
    ]);
  });

  it("parses negative availability constraints", () => {
    const result = parseSpanishDate("los martes a la mañana no puedo", context);

    expect(result.errors).toEqual([]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        kind: "availability_filter",
        excludedWeekdays: [2],
        timeRange: {
          from: "08:00",
          to: "12:00",
          label: "manana",
          precision: "coarse",
        },
      }),
    ]);
  });

  it("parses negative weekday-only exclusions", () => {
    const result = parseSpanishDate("excepto los martes", context);

    expect(result.errors).toEqual([]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        kind: "availability_filter",
        excludedWeekdays: [2],
      }),
    ]);
  });

  it("parses open-ended time constraints like después de las 18", () => {
    const result = parseSpanishDate("viernes después de las 18", context);

    expect(result.errors).toEqual([]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        kind: "datetime",
        exactDate: "2026-04-03",
        timeRange: {
          from: "18:00",
          to: "23:59",
          label: "despues_de",
          precision: "coarse",
        },
      }),
    ]);
  });

  it("corrects common colloquial typos like pasao mañana", () => {
    const result = parseSpanishDate("pasao mañana", context);

    expect(result.normalizedText).toBe("pasado manana");
    expect(result.corrections).toEqual([
      {
        from: "pasao",
        to: "pasado",
        reason: "typo",
      },
    ]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        kind: "date",
        exactDate: "2026-04-02",
      }),
    ]);
  });

  it("uses fuzzy correction for weekday typos like vierns", () => {
    const result = parseSpanishDate("vierns", context);

    expect(result.normalizedText).toBe("viernes");
    expect(result.corrections).toEqual([
      {
        from: "vierns",
        to: "viernes",
        reason: "typo",
      },
    ]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        kind: "date",
        exactDate: "2026-04-03",
      }),
    ]);
  });

  it("returns a parse error when there is no temporal content", () => {
    const result = parseSpanishDate("hola, cómo estás?", context);

    expect(result.candidates).toEqual([]);
    expect(result.errors).toEqual([
      {
        code: "NO_TEMPORAL_EXPRESSION",
        message: "No temporal expression could be parsed from the input.",
      },
    ]);
  });
});
