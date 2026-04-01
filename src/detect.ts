import type { Correction, DateExpression, ParsedTemporalExpression, TimeExpression } from "./types";

const WEEKDAY_BY_NAME: Record<string, number> = {
  domingo: 7,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

function detectDateExpression(
  normalizedText: string,
  corrections: Correction[]
): DateExpression | undefined {
  if (/\bfinde\b/.test(normalizedText)) {
    return { kind: "weekend" };
  }

  if (normalizedText.includes("la semana que viene")) {
    return { kind: "next_week" };
  }

  if (/\bpasado manana\b/.test(normalizedText)) {
    return { kind: "relative_day", offsetDays: 2 };
  }

  if (/\bhoy\b/.test(normalizedText)) {
    return { kind: "relative_day", offsetDays: 0 };
  }

  if (/\bmanana\b/.test(normalizedText) && !/\ba la manana\b/.test(normalizedText)) {
    return { kind: "relative_day", offsetDays: 1 };
  }

  const ambiguousNextWeekdayMatch = normalizedText.match(/\bproximo (lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
  if (ambiguousNextWeekdayMatch) {
    const hasAbbreviatedImmediateHint = corrections.some(
      (correction) => correction.reason === "abbreviation" && correction.to === "proximo"
    );

    if (hasAbbreviatedImmediateHint) {
      return {
        kind: "weekday",
        weekday: WEEKDAY_BY_NAME[ambiguousNextWeekdayMatch[1]] ?? 1,
      };
    }

    return {
      kind: "ambiguous_next_weekday",
      weekday: WEEKDAY_BY_NAME[ambiguousNextWeekdayMatch[1]] ?? 0,
    };
  }

  const weekdayMatch = normalizedText.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
  if (weekdayMatch) {
    return {
      kind: "weekday",
      weekday: WEEKDAY_BY_NAME[weekdayMatch[1]] ?? 0,
    };
  }

  return undefined;
}

function detectTimeExpression(normalizedText: string): TimeExpression | undefined {
  const afterHourMatch = normalizedText.match(/\bdespues de las (\d{1,2})(?::(\d{2}))?\b/);
  if (afterHourMatch) {
    const hour = afterHourMatch[1].padStart(2, "0");
    const minutes = afterHourMatch[2] ?? "00";

    return {
      kind: "time_range",
      from: `${hour}:${minutes}`,
      to: "23:59",
      label: "despues_de",
      precision: "coarse",
    };
  }

  if (/\ba la manana\b/.test(normalizedText)) {
    return {
      kind: "time_range",
      from: "08:00",
      to: "12:00",
      label: "manana",
      precision: "coarse",
    };
  }

  if (/\ba la tarde\b/.test(normalizedText)) {
    return {
      kind: "time_range",
      from: "13:00",
      to: "19:00",
      label: "tarde",
      precision: "coarse",
    };
  }

  return undefined;
}

function detectRecurrenceExpression(normalizedText: string) {
  const weeklyMatch = normalizedText.match(/\btodos los (lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
  if (!weeklyMatch) {
    return undefined;
  }

  return {
    frequency: "weekly" as const,
    interval: 1,
    weekdays: [WEEKDAY_BY_NAME[weeklyMatch[1]] ?? 1],
  };
}

export function detectTemporalExpression(
  normalizedText: string,
  corrections: Correction[] = []
): ParsedTemporalExpression {
  return {
    recurrence: detectRecurrenceExpression(normalizedText),
    date: detectDateExpression(normalizedText, corrections),
    time: detectTimeExpression(normalizedText),
    negative: /\bno puedo\b|\bexcepto\b|\bmenos\b/.test(normalizedText),
  };
}
