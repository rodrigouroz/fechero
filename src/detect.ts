import type { Correction, DateExpression, ParsedTemporalExpression, SourceSpan, TimeExpression } from "./types";

const WEEKDAY_BY_NAME: Record<string, number> = {
  domingo: 7,
  domingos: 7,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sabados: 6,
};

const MONTH_BY_NAME: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const WEEKDAY_PATTERN = "(domingo|lunes|martes|miercoles|jueves|viernes|sabado)";

function parseHour(hourText: string, minuteText = "00", options?: { inferAfternoon?: boolean }) {
  let hour = Number.parseInt(hourText, 10);
  if (options?.inferAfternoon && hour >= 1 && hour <= 7) {
    hour += 12;
  }

  const minutes = Number.parseInt(minuteText, 10);

  if (Number.isNaN(hour) || Number.isNaN(minutes) || hour < 0 || hour > 23 || minutes < 0 || minutes > 59) {
    return undefined;
  }

  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function toSourceSpan(normalizedText: string, match: RegExpMatchArray): SourceSpan {
  const text = match[0];
  const start = match.index ?? normalizedText.indexOf(text);
  return {
    text,
    start,
    end: start + text.length,
  };
}

function detectDateExpression(
  normalizedText: string,
  corrections: Correction[]
): DateExpression | undefined {
  const absoluteDateMatch = normalizedText.match(
    new RegExp(`(?:\\b${WEEKDAY_PATTERN}\\b\\s+)?(\\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: de (\\d{4}))?`, "u")
  );
  if (absoluteDateMatch) {
    return {
      kind: "absolute_date",
      day: Number.parseInt(absoluteDateMatch[2], 10),
      month: MONTH_BY_NAME[absoluteDateMatch[3]] ?? 1,
      year: absoluteDateMatch[4] ? Number.parseInt(absoluteDateMatch[4], 10) : undefined,
      weekday: absoluteDateMatch[1] ? WEEKDAY_BY_NAME[absoluteDateMatch[1]] : undefined,
    };
  }

  if (/\bfinde\b/.test(normalizedText)) {
    return { kind: "weekend" };
  }

  if (/\besta semana\b/.test(normalizedText)) {
    return { kind: "current_week" };
  }

  if (/\bla otra semana\b/.test(normalizedText)) {
    return { kind: "week_after_next" };
  }

  if (
    normalizedText.includes("la semana que viene") ||
    normalizedText.includes("la proxima semana") ||
    normalizedText.includes("la proximo semana") ||
    normalizedText.includes("la semana proxima") ||
    normalizedText.includes("la semana proximo")
  ) {
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

  const nextWeekWeekdayMatch = normalizedText.match(
    new RegExp(`\\b(?:el\\s+)?${WEEKDAY_PATTERN} que viene\\b|\\b(?:el\\s+)?${WEEKDAY_PATTERN} proximo\\b`, "u")
  );
  if (nextWeekWeekdayMatch) {
    const weekdayName = nextWeekWeekdayMatch[1] ?? nextWeekWeekdayMatch[2];
    return {
      kind: "next_week_weekday",
      weekday: WEEKDAY_BY_NAME[weekdayName] ?? 1,
    };
  }

  const thisWeekdayMatch = normalizedText.match(new RegExp(`\\beste ${WEEKDAY_PATTERN}\\b`, "u"));
  if (thisWeekdayMatch) {
    return {
      kind: "this_weekday",
      weekday: WEEKDAY_BY_NAME[thisWeekdayMatch[1]] ?? 1,
    };
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

  const weekdayMatch = normalizedText.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|sabados|domingo|domingos)\b/);
  if (weekdayMatch) {
    return {
      kind: "weekday",
      weekday: WEEKDAY_BY_NAME[weekdayMatch[1]] ?? 0,
    };
  }

  return undefined;
}

function detectTimeExpression(normalizedText: string): { time?: TimeExpression; spans: SourceSpan[] } {
  const betweenMatch = normalizedText.match(/\bentre (\d{1,2})(?::(\d{2}))? y (\d{1,2})(?::(\d{2}))?\b/);
  if (betweenMatch) {
    const from = parseHour(betweenMatch[1], betweenMatch[2] ?? "00");
    const to = parseHour(betweenMatch[3], betweenMatch[4] ?? "00");

    if (from && to) {
      return {
        time: {
          kind: "time_range",
          from,
          to,
          label: "entre",
          precision: "exact",
        },
        spans: [toSourceSpan(normalizedText, betweenMatch)],
      };
    }
  }

  const beforeHourMatch = normalizedText.match(/\bantes de las (\d{1,2})(?::(\d{2}))?\b/);
  if (beforeHourMatch) {
    const to = parseHour(beforeHourMatch[1], beforeHourMatch[2] ?? "00");

    if (to) {
      return {
        time: {
          kind: "time_range",
          from: "00:00",
          to,
          label: "antes_de",
          precision: "coarse",
        },
        spans: [toSourceSpan(normalizedText, beforeHourMatch)],
      };
    }
  }

  const afterHourMatch = normalizedText.match(/\bdespues de las (\d{1,2})(?::(\d{2}))?\b/);
  if (afterHourMatch) {
    const from = parseHour(afterHourMatch[1], afterHourMatch[2] ?? "00");

    if (from) {
      return {
        time: {
          kind: "time_range",
          from,
          to: "23:59",
          label: "despues_de",
          precision: "coarse",
        },
        spans: [toSourceSpan(normalizedText, afterHourMatch)],
      };
    }
  }

  if (/\ba la manana\b/.test(normalizedText)) {
    return {
      time: {
        kind: "time_range",
        from: "08:00",
        to: "12:00",
        label: "manana",
        precision: "coarse",
      },
      spans: [{
        text: "a la manana",
        start: normalizedText.indexOf("a la manana"),
        end: normalizedText.indexOf("a la manana") + "a la manana".length,
      }],
    };
  }

  if (/\ba la tarde\b/.test(normalizedText)) {
    return {
      time: {
        kind: "time_range",
        from: "13:00",
        to: "19:00",
        label: "tarde",
        precision: "coarse",
      },
      spans: [{
        text: "a la tarde",
        start: normalizedText.indexOf("a la tarde"),
        end: normalizedText.indexOf("a la tarde") + "a la tarde".length,
      }],
    };
  }

  const exactWithMinutesMatch = normalizedText.match(/\b(?:a las\s+)?(\d{1,2}):(\d{2})\b/);
  if (exactWithMinutesMatch) {
    const value = parseHour(exactWithMinutesMatch[1], exactWithMinutesMatch[2]);

    if (value) {
      return {
        time: {
          kind: "exact_time",
          value,
          isApproximate: false,
        },
        spans: [toSourceSpan(normalizedText, exactWithMinutesMatch)],
      };
    }
  }

  const exactHourMatch = normalizedText.match(/\ba las (\d{1,2})\b/);
  if (exactHourMatch) {
    const value = parseHour(exactHourMatch[1]);
    if (value) {
      return {
        time: {
          kind: "exact_time",
          value,
          isApproximate: false,
        },
        spans: [toSourceSpan(normalizedText, exactHourMatch)],
      };
    }
  }

  const tipoHourMatch = normalizedText.match(/\btipo (\d{1,2})(?::(\d{2}))?\b/);
  if (tipoHourMatch) {
    const value = parseHour(tipoHourMatch[1], tipoHourMatch[2] ?? "00", { inferAfternoon: true });
    if (value) {
      return {
        time: {
          kind: "exact_time",
          value,
          isApproximate: true,
        },
        spans: [toSourceSpan(normalizedText, tipoHourMatch)],
      };
    }
  }

  return { spans: [] };
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
  const detectedTime = detectTimeExpression(normalizedText);

  return {
    sourceSpans: detectedTime.spans,
    recurrence: detectRecurrenceExpression(normalizedText),
    date: detectDateExpression(normalizedText, corrections),
    time: detectedTime.time,
    negative: /\bno puedo\b|\bexcepto\b|\bmenos\b/.test(normalizedText),
  };
}
