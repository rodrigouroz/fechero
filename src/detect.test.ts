import { describe, expect, it } from "vitest";

import { detectTemporalExpression } from "./detect";

describe("detectTemporalExpression", () => {
  it("detects ISO numeric dates", () => {
    const result = detectTemporalExpression("nos vemos 2026-04-09");
    expect(result.date).toEqual({
      kind: "absolute_date",
      year: 2026,
      month: 4,
      day: 9,
    });
  });

  it("detects DD/MM/YYYY numeric dates", () => {
    const result = detectTemporalExpression("nos vemos 9/4/2026");
    expect(result.date).toEqual({
      kind: "absolute_date",
      year: 2026,
      month: 4,
      day: 9,
    });
  });

  it("detects DD/MM short numeric dates", () => {
    const result = detectTemporalExpression("el 9/4");
    expect(result.date).toEqual({ kind: "absolute_date", day: 9, month: 4 });
  });

  it("detects relative offsets like 'en 3 dias'", () => {
    const result = detectTemporalExpression("en 3 dias");
    expect(result.date).toEqual({ kind: "in_days", days: 3 });
  });

  it("detects 'dentro de 2 semanas'", () => {
    const result = detectTemporalExpression("dentro de 2 semanas");
    expect(result.date).toEqual({ kind: "in_weeks", weeks: 2 });
  });

  it("detects weekday ranges like 'de lunes a viernes'", () => {
    const result = detectTemporalExpression("de lunes a viernes");
    expect(result.date).toEqual({
      kind: "weekday_range",
      fromWeekday: 1,
      toWeekday: 5,
    });
  });

  it("detects weekday lists like 'lunes, martes y jueves'", () => {
    const result = detectTemporalExpression("lunes, martes y jueves");
    expect(result.date).toEqual({ kind: "weekdays", weekdays: [1, 2, 4] });
  });

  it("detects month-of-year", () => {
    const result = detectTemporalExpression("en abril");
    expect(result.date).toEqual({ kind: "month_of_year", month: 4 });
  });

  it("detects 'fin de mes'", () => {
    const result = detectTemporalExpression("a fin de mes");
    expect(result.date).toEqual({ kind: "end_of_month" });
  });

  it("detects ordinal weekday of the month", () => {
    const result = detectTemporalExpression("el primer lunes del mes");
    expect(result.date).toEqual({
      kind: "nth_weekday_of_month",
      ordinal: 1,
      weekday: 1,
    });
  });

  it("detects mediodia as exact time 12:00", () => {
    const result = detectTemporalExpression("al mediodia");
    expect(result.time).toEqual({
      kind: "exact_time",
      value: "12:00",
      isApproximate: false,
    });
  });

  it("detects medianoche as exact time 00:00", () => {
    const result = detectTemporalExpression("a medianoche");
    expect(result.time).toEqual({
      kind: "exact_time",
      value: "00:00",
      isApproximate: false,
    });
  });

  it("flags hour 1-6 without context as ambiguous", () => {
    const result = detectTemporalExpression("a las 3");
    expect(result.time).toMatchObject({
      kind: "exact_time",
      value: "03:00",
      hourAmbiguous: true,
    });
  });

  it("does not flag hour 10 as ambiguous", () => {
    const result = detectTemporalExpression("a las 10");
    expect(result.time).toEqual({
      kind: "exact_time",
      value: "10:00",
      isApproximate: false,
    });
  });

  it("uses afternoon context to disambiguate hours", () => {
    const result = detectTemporalExpression("a las 3 de la tarde");
    expect(result.time).toMatchObject({
      kind: "exact_time",
      value: "15:00",
    });
    expect(result.timeContext).toBe("afternoon");
  });

  it("detects 'y media'", () => {
    const result = detectTemporalExpression("a las 14 y media");
    expect(result.time).toMatchObject({
      kind: "exact_time",
      value: "14:30",
    });
  });

  it("detects 'y cuarto'", () => {
    const result = detectTemporalExpression("a las 14 y cuarto");
    expect(result.time).toMatchObject({
      kind: "exact_time",
      value: "14:15",
    });
  });

  it("detects 'menos cuarto'", () => {
    const result = detectTemporalExpression("a las 15 menos cuarto");
    expect(result.time).toMatchObject({
      kind: "exact_time",
      value: "14:45",
    });
  });

  it("detects 'de X a Y' time range", () => {
    const result = detectTemporalExpression("de 14 a 16");
    expect(result.time).toMatchObject({
      kind: "time_range",
      from: "14:00",
      to: "16:00",
      label: "de_a",
    });
  });

  it("detects daily recurrence", () => {
    const result = detectTemporalExpression("todos los dias");
    expect(result.recurrence).toEqual({ frequency: "daily", interval: 1 });
  });

  it("detects 'cada 2 semanas'", () => {
    const result = detectTemporalExpression("cada 2 semanas");
    expect(result.recurrence).toEqual({ frequency: "weekly", interval: 2 });
  });

  it("detects 'todos los lunes y miercoles' as multi-weekday recurrence", () => {
    const result = detectTemporalExpression("todos los lunes y miercoles");
    expect(result.recurrence).toEqual({
      frequency: "weekly",
      interval: 1,
      weekdays: [1, 3],
    });
  });

  it("detects durations", () => {
    const result = detectTemporalExpression("por 2 horas");
    expect(result.duration).toEqual({ kind: "duration", minutes: 120 });
  });

  it("detects half-hour durations", () => {
    const result = detectTemporalExpression("por media hora");
    expect(result.duration).toEqual({ kind: "duration", minutes: 30 });
  });
});
