import type {
  Correction,
  DateExpression,
  ParsedTemporalExpression,
  RecurrenceRule,
  SourceSpan,
  TimeExpression,
} from "./types";

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
const MONTH_PATTERN =
  "(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)";

type DateDetection = {
  date?: DateExpression;
  spans: SourceSpan[];
};

type TimeDetection = {
  time?: TimeExpression;
  spans: SourceSpan[];
};

type RecurrenceDetection = {
  recurrence?: RecurrenceRule;
  spans: SourceSpan[];
};

function parseHour(hourText: string, minuteText = "00", options?: { inferAfternoon?: boolean }) {
  let hour = Number.parseInt(hourText, 10);
  if (options?.inferAfternoon && hour >= 1 && hour <= 7) {
    hour += 12;
  }

  const minutes = Number.parseInt(minuteText, 10);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minutes) ||
    hour < 0 ||
    hour > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
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

function toCapturedSourceSpan(
  normalizedText: string,
  match: RegExpMatchArray,
  capturedText: string
): SourceSpan {
  const fullStart = match.index ?? normalizedText.indexOf(match[0]);
  const offset = match[0].indexOf(capturedText);
  const start = fullStart + Math.max(offset, 0);

  return {
    text: capturedText,
    start,
    end: start + capturedText.length,
  };
}

function offsetSpans(spans: SourceSpan[], offset: number): SourceSpan[] {
  return spans.map((span) => ({
    ...span,
    start: span.start + offset,
    end: span.end + offset,
  }));
}

function uniqueSpans(spans: SourceSpan[]): SourceSpan[] {
  const seen = new Set<string>();

  return [...spans]
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

function detectDateExpression(
  normalizedText: string,
  corrections: Correction[]
): DateDetection {
  const absoluteDateMatch = normalizedText.match(
    new RegExp(
      `(?:\\b(?:el|la)\\s+)?(?<core>(?:(?<weekday>${WEEKDAY_PATTERN})\\s+)?(?<day>\\d{1,2}) de (?<month>${MONTH_PATTERN})(?: de (?<year>\\d{4}))?)`,
      "u"
    )
  );
  if (absoluteDateMatch?.groups) {
    return {
      date: {
        kind: "absolute_date",
        day: Number.parseInt(absoluteDateMatch.groups.day, 10),
        month: MONTH_BY_NAME[absoluteDateMatch.groups.month] ?? 1,
        year: absoluteDateMatch.groups.year
          ? Number.parseInt(absoluteDateMatch.groups.year, 10)
          : undefined,
        weekday: absoluteDateMatch.groups.weekday
          ? WEEKDAY_BY_NAME[absoluteDateMatch.groups.weekday]
          : undefined,
      },
      spans: [
        toCapturedSourceSpan(
          normalizedText,
          absoluteDateMatch,
          absoluteDateMatch.groups.core
        ),
      ],
    };
  }

  const weekdayDayMatch = normalizedText.match(
    new RegExp(
      `(?:\\b(?:el|la)\\s+)?(?<core>(?<weekday>${WEEKDAY_PATTERN})\\s+(?<day>\\d{1,2}))\\b`,
      "u"
    )
  );
  if (weekdayDayMatch?.groups) {
    return {
      date: {
        kind: "day_of_month",
        day: Number.parseInt(weekdayDayMatch.groups.day, 10),
        weekday: WEEKDAY_BY_NAME[weekdayDayMatch.groups.weekday] ?? 1,
      },
      spans: [
        toCapturedSourceSpan(
          normalizedText,
          weekdayDayMatch,
          weekdayDayMatch.groups.core
        ),
      ],
    };
  }

  const weekendMatch = normalizedText.match(/\bfinde\b/u);
  if (weekendMatch) {
    return {
      date: { kind: "weekend" },
      spans: [toSourceSpan(normalizedText, weekendMatch)],
    };
  }

  const currentWeekMatch = normalizedText.match(/\besta semana\b/u);
  if (currentWeekMatch) {
    return {
      date: { kind: "current_week" },
      spans: [toSourceSpan(normalizedText, currentWeekMatch)],
    };
  }

  const weekAfterNextMatch = normalizedText.match(/\bla otra semana\b/u);
  if (weekAfterNextMatch) {
    return {
      date: { kind: "week_after_next" },
      spans: [toSourceSpan(normalizedText, weekAfterNextMatch)],
    };
  }

  const nextWeekMatch = normalizedText.match(
    /\b(?<core>la semana que viene|la proxima semana|la proximo semana|la semana proxima|la semana proximo)\b/u
  );
  if (nextWeekMatch?.groups?.core) {
    return {
      date: { kind: "next_week" },
      spans: [toCapturedSourceSpan(normalizedText, nextWeekMatch, nextWeekMatch.groups.core)],
    };
  }

  const pastTomorrowMatch = normalizedText.match(/\bpasado manana\b/u);
  if (pastTomorrowMatch) {
    return {
      date: { kind: "relative_day", offsetDays: 2 },
      spans: [toSourceSpan(normalizedText, pastTomorrowMatch)],
    };
  }

  const todayMatch = normalizedText.match(/\bhoy\b/u);
  if (todayMatch) {
    return {
      date: { kind: "relative_day", offsetDays: 0 },
      spans: [toSourceSpan(normalizedText, todayMatch)],
    };
  }

  const tomorrowMatch = normalizedText.match(/\bmanana\b/u);
  if (
    tomorrowMatch &&
    !/\ba la manana\b/u.test(normalizedText) &&
    !/\bpor la manana\b/u.test(normalizedText)
  ) {
    return {
      date: { kind: "relative_day", offsetDays: 1 },
      spans: [toSourceSpan(normalizedText, tomorrowMatch)],
    };
  }

  const nextWeekWeekdayMatch = normalizedText.match(
    new RegExp(
      `(?:\\b(?:el|la)\\s+)?(?<core>(?:(?<weekdayA>${WEEKDAY_PATTERN}) que viene|(?<weekdayB>${WEEKDAY_PATTERN}) proximo))\\b`,
      "u"
    )
  );
  if (nextWeekWeekdayMatch?.groups) {
    const weekdayName =
      nextWeekWeekdayMatch.groups.weekdayA ?? nextWeekWeekdayMatch.groups.weekdayB;
    return {
      date: {
        kind: "next_week_weekday",
        weekday: WEEKDAY_BY_NAME[weekdayName] ?? 1,
      },
      spans: [
        toCapturedSourceSpan(
          normalizedText,
          nextWeekWeekdayMatch,
          nextWeekWeekdayMatch.groups.core
        ),
      ],
    };
  }

  const thisWeekdayMatch = normalizedText.match(
    new RegExp(`\\b(?:el\\s+)?(?<core>este (?<weekday>${WEEKDAY_PATTERN}))\\b`, "u")
  );
  if (thisWeekdayMatch?.groups) {
    return {
      date: {
        kind: "this_weekday",
        weekday: WEEKDAY_BY_NAME[thisWeekdayMatch.groups.weekday] ?? 1,
      },
      spans: [
        toCapturedSourceSpan(
          normalizedText,
          thisWeekdayMatch,
          thisWeekdayMatch.groups.core
        ),
      ],
    };
  }

  const ambiguousNextWeekdayMatch = normalizedText.match(
    /\b(?<core>proximo (?<weekday>lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/u
  );
  if (ambiguousNextWeekdayMatch?.groups) {
    const hasAbbreviatedImmediateHint = corrections.some(
      (correction) => correction.reason === "abbreviation" && correction.to === "proximo"
    );

    return {
      date: hasAbbreviatedImmediateHint
        ? {
            kind: "weekday",
            weekday: WEEKDAY_BY_NAME[ambiguousNextWeekdayMatch.groups.weekday] ?? 1,
          }
        : {
            kind: "ambiguous_next_weekday",
            weekday: WEEKDAY_BY_NAME[ambiguousNextWeekdayMatch.groups.weekday] ?? 1,
          },
      spans: [
        toCapturedSourceSpan(
          normalizedText,
          ambiguousNextWeekdayMatch,
          ambiguousNextWeekdayMatch.groups.core
        ),
      ],
    };
  }

  const weekdayMatch = normalizedText.match(
    /\b(?<weekday>lunes|martes|miercoles|jueves|viernes|sabado|sabados|domingo|domingos)\b/u
  );
  if (weekdayMatch?.groups?.weekday) {
    return {
      date: {
        kind: "weekday",
        weekday: WEEKDAY_BY_NAME[weekdayMatch.groups.weekday] ?? 1,
      },
      spans: [toCapturedSourceSpan(normalizedText, weekdayMatch, weekdayMatch.groups.weekday)],
    };
  }

  return { spans: [] };
}

function detectTimeExpression(normalizedText: string): TimeDetection {
  const betweenMatch = normalizedText.match(
    /\bentre (\d{1,2})(?::(\d{2}))? y (\d{1,2})(?::(\d{2}))?\b/u
  );
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

  const beforeHourMatch = normalizedText.match(/\bantes de las (\d{1,2})(?::(\d{2}))?\b/u);
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

  const afterHourMatch = normalizedText.match(/\bdespues de las (\d{1,2})(?::(\d{2}))?\b/u);
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

  const morningMatch = normalizedText.match(/\b(a la manana|por la manana)\b/u);
  if (morningMatch) {
    return {
      time: {
        kind: "time_range",
        from: "08:00",
        to: "12:00",
        label: "manana",
        precision: "coarse",
      },
      spans: [toSourceSpan(normalizedText, morningMatch)],
    };
  }

  const afternoonMatch = normalizedText.match(/\b(a la tarde|por la tarde)\b/u);
  if (afternoonMatch) {
    return {
      time: {
        kind: "time_range",
        from: "13:00",
        to: "19:00",
        label: "tarde",
        precision: "coarse",
      },
      spans: [toSourceSpan(normalizedText, afternoonMatch)],
    };
  }

  const exactWithMinutesMatch = normalizedText.match(/\b(?:a las\s+)?(\d{1,2}):(\d{2})\b/u);
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

  const exactHourMatch = normalizedText.match(/\ba las (\d{1,2})\b/u);
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

  const tipoHourMatch = normalizedText.match(/\btipo (\d{1,2})(?::(\d{2}))?\b/u);
  if (tipoHourMatch) {
    const value = parseHour(tipoHourMatch[1], tipoHourMatch[2] ?? "00", {
      inferAfternoon: true,
    });
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

function detectRecurrenceExpression(normalizedText: string): RecurrenceDetection {
  const weeklyMatch = normalizedText.match(
    /\b(?<core>todos los (lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/u
  );
  if (!weeklyMatch?.groups?.core) {
    return { spans: [] };
  }

  const weekdayName = weeklyMatch[2];

  return {
    recurrence: {
      frequency: "weekly",
      interval: 1,
      weekdays: [WEEKDAY_BY_NAME[weekdayName] ?? 1],
    },
    spans: [toCapturedSourceSpan(normalizedText, weeklyMatch, weeklyMatch.groups.core)],
  };
}

function detectRecurrenceStartExpression(
  normalizedText: string,
  corrections: Correction[]
): DateDetection {
  const anchorPatterns = [
    /\b(?:empezando|desde|arrancando)\s+(?<tail>.+)$/u,
    /\ba partir de(?:l| la)?\s+(?<tail>.+)$/u,
  ];

  for (const pattern of anchorPatterns) {
    const anchorMatch = normalizedText.match(pattern);
    const rawTail = anchorMatch?.groups?.tail;
    if (!anchorMatch || !rawTail) {
      continue;
    }

    const detection = detectDateExpression(rawTail, corrections);
    if (!detection.date) {
      continue;
    }

    const fullStart = anchorMatch.index ?? normalizedText.indexOf(anchorMatch[0]);
    const tailStart = fullStart + anchorMatch[0].length - rawTail.length;

    return {
      date: detection.date,
      spans: offsetSpans(detection.spans, tailStart),
    };
  }

  return { spans: [] };
}

export function detectTemporalExpression(
  normalizedText: string,
  corrections: Correction[] = []
): ParsedTemporalExpression {
  const recurrenceDetection = detectRecurrenceExpression(normalizedText);
  const detectedTime = detectTimeExpression(normalizedText);
  const recurrenceStartDetection = recurrenceDetection.recurrence
    ? detectRecurrenceStartExpression(normalizedText, corrections)
    : { spans: [] };
  const detectedDate = recurrenceDetection.recurrence
    ? { spans: [] }
    : detectDateExpression(normalizedText, corrections);

  return {
    sourceSpans: uniqueSpans([
      ...recurrenceDetection.spans,
      ...detectedDate.spans,
      ...recurrenceStartDetection.spans,
      ...detectedTime.spans,
    ]),
    recurrence: recurrenceDetection.recurrence,
    recurrenceStart: recurrenceStartDetection.date,
    date: detectedDate.date,
    time: detectedTime.time,
    negative: /\bno puedo\b|\bexcepto\b|\bmenos\b|\bsalvo\b/u.test(normalizedText),
  };
}
