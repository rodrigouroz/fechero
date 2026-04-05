import type {
  Correction,
  DateExpression,
  DurationExpression,
  ParsedTemporalExpression,
  RecurrenceRule,
  SourceSpan,
  TimeExpression,
} from "./types";

// ---------------------------------------------------------------------------
// Lexical tables
// ---------------------------------------------------------------------------

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

const ORDINAL_BY_NAME: Record<string, number> = {
  primer: 1,
  primero: 1,
  primera: 1,
  segundo: 2,
  segunda: 2,
  tercer: 3,
  tercero: 3,
  tercera: 3,
  cuarto: 4,
  cuarta: 4,
  quinto: 5,
  quinta: 5,
  ultimo: -1,
  ultima: -1,
};

const WEEKDAY_PATTERN = "(domingo|lunes|martes|miercoles|jueves|viernes|sabado)";
const MONTH_PATTERN =
  "(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)";
const ORDINAL_PATTERN = "(primer|primero|segundo|tercer|tercero|cuarto|quinto|ultimo)";

// ---------------------------------------------------------------------------
// Module-level regex constants (compiled once).
// ---------------------------------------------------------------------------

const RE_ISO_DATE = /\b(?<year>\d{4})-(?<month>\d{1,2})-(?<day>\d{1,2})\b/u;
const RE_NUMERIC_DATE_FULL =
  /(?:^|[^\d])(?<day>\d{1,2})[/-](?<month>\d{1,2})[/-](?<year>\d{2,4})(?=\b|[^\d])/u;
const RE_NUMERIC_DATE_SHORT = /(?:^|[^\d/-])(?<day>\d{1,2})[/-](?<month>\d{1,2})(?=\b|[^\d/-])/u;

const RE_ABSOLUTE_DATE = new RegExp(
  `(?:\\b(?:el|la)\\s+)?(?<core>(?:(?<weekday>${WEEKDAY_PATTERN})\\s+)?(?<day>\\d{1,2}) de (?<month>${MONTH_PATTERN})(?: de (?<year>\\d{4}))?)`,
  "u"
);

const RE_WEEKDAY_DAY_OF_MONTH = new RegExp(
  `(?:\\b(?:el|la)\\s+)?(?<core>(?<weekday>${WEEKDAY_PATTERN})\\s+(?<day>\\d{1,2}))\\b`,
  "u"
);

const RE_WEEKEND = /\bfinde\b/u;
const RE_CURRENT_WEEK = /\besta semana\b/u;
const RE_WEEK_AFTER_NEXT = /\bla otra semana\b/u;
const RE_NEXT_WEEK =
  /\b(?<core>la semana que viene|la proxima semana|la proximo semana|la semana proxima|la semana proximo)\b/u;
const RE_PAST_TOMORROW = /\bpasado manana\b/u;
const RE_TODAY = /\bhoy\b/u;
const RE_TOMORROW = /\bmanana\b/u;
const RE_MORNING_CONTEXT = /\b(a la manana|por la manana|de la manana)\b/u;
const RE_AFTERNOON_CONTEXT = /\b(a la tarde|por la tarde|de la tarde)\b/u;
const RE_NIGHT_CONTEXT = /\b(a la noche|por la noche|de la noche)\b/u;
const RE_EARLY_MORNING_CONTEXT = /\b(de la madrugada|a la madrugada|de madrugada)\b/u;
const RE_NOON = /\b(a(l)? )?mediod[ií]a\b/u;
const RE_MIDNIGHT = /\b(a )?medianoche\b/u;

const RE_NEXT_WEEK_WEEKDAY = new RegExp(
  `(?:\\b(?:el|la)\\s+)?(?<core>(?:(?<weekdayA>${WEEKDAY_PATTERN}) que viene|(?<weekdayB>${WEEKDAY_PATTERN}) proximo))\\b`,
  "u"
);

const RE_THIS_WEEKDAY = new RegExp(
  `\\b(?:el\\s+)?(?<core>este (?<weekday>${WEEKDAY_PATTERN}))\\b`,
  "u"
);

const RE_AMBIGUOUS_NEXT_WEEKDAY =
  /\b(?<core>proximo (?<weekday>lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/u;

const RE_WEEKDAY =
  /\b(?<weekday>lunes|martes|miercoles|jueves|viernes|sabado|sabados|domingo|domingos)\b/u;

const RE_WEEKDAY_RANGE = new RegExp(`\\bde ${WEEKDAY_PATTERN} a ${WEEKDAY_PATTERN}\\b`, "u");

const RE_WEEKDAY_LIST = new RegExp(
  `\\b${WEEKDAY_PATTERN}(?:, ${WEEKDAY_PATTERN})*(?: y ${WEEKDAY_PATTERN})\\b`,
  "u"
);

const RE_IN_DAYS = /\b(?:en|dentro de) (?<n>\d{1,3}) d[ií]as?\b/u;
const RE_IN_WEEKS = /\b(?:en|dentro de) (?<n>\d{1,2}) semanas?\b/u;
const RE_IN_MONTHS = /\b(?:en|dentro de) (?<n>\d{1,2}) meses?\b/u;

const RE_CURRENT_MONTH = /\beste mes\b/u;
const RE_NEXT_MONTH = /\b(el mes que viene|el proximo mes|el mes proximo)\b/u;
const RE_END_OF_MONTH = /\b(?:a )?fin(?:es)? de (?:este )?mes\b/u;
const RE_START_OF_MONTH = /\b(?:a )?(?:principios?|comienzos?|inicio) de (?:este )?mes\b/u;
const RE_MID_MONTH = /\b(?:a )?mediados de (?:este )?mes\b/u;
const RE_MONTH_OF_YEAR = new RegExp(`\\ben ${MONTH_PATTERN}(?: de (?<year>\\d{4}))?\\b`, "u");

const RE_NTH_WEEKDAY_OF_MONTH = new RegExp(
  `\\bel ${ORDINAL_PATTERN} (?<weekday>${WEEKDAY_PATTERN})(?: del (?:mes|proximo mes))?\\b`,
  "u"
);

const RE_BETWEEN_TIME =
  /\bentre (?:las\s+)?(\d{1,2})(?::(\d{2}))? y (?:las\s+)?(\d{1,2})(?::(\d{2}))?\b/u;
const RE_RANGE_TIME =
  /\bde (?:las\s+)?(\d{1,2})(?::(\d{2}))? a (?:las\s+)?(\d{1,2})(?::(\d{2}))?\b/u;
const RE_BEFORE_TIME = /\bantes de (?:las\s+)?(\d{1,2})(?::(\d{2}))?\b/u;
const RE_AFTER_TIME = /\bdespues de (?:las\s+)?(\d{1,2})(?::(\d{2}))?\b/u;

const RE_HALF_PAST = /\b(?:a las\s+)?(?<h>\d{1,2}) y media\b/u;
const RE_QUARTER_PAST = /\b(?:a las\s+)?(?<h>\d{1,2}) y cuarto\b/u;
const RE_QUARTER_TO = /\b(?:a las\s+)?(?<h>\d{1,2}) menos cuarto\b/u;
const RE_EXACT_WITH_MINUTES = /\b(?:a las\s+)?(\d{1,2}):(\d{2})(?:\s*hs?)?\b/u;
const RE_EXACT_HOUR = /\ba las (\d{1,2})(?:\s*hs?)?\b/u;
const RE_HOUR_HS_SUFFIX = /\b(\d{1,2})\s*hs\b/u;
const RE_TIPO_HOUR = /\btipo (\d{1,2})(?::(\d{2}))?\b/u;
const RE_HOUR_AMPM = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/iu;

const RE_DURATION_HOURS = /\b(?:por|durante) (?<n>\d+(?:[.,]\d+)?) (?:horas?|hs?)\b/u;
const RE_DURATION_MINUTES = /\b(?:por|durante) (?<n>\d+) (?:minutos?|mins?)\b/u;
const RE_DURATION_HALF_HOUR = /\b(?:por|durante) media hora\b/u;

const RE_WEEKLY_RECURRENCE =
  /\b(?<core>todos los (?<first>lunes|martes|miercoles|jueves|viernes|sabado|domingo))(?: y (?<second>lunes|martes|miercoles|jueves|viernes|sabado|domingo))?\b/u;
const RE_DAILY_RECURRENCE = /\b(?<core>todos los dias|cada dia)\b/u;
const RE_EVERY_N_WEEKS = /\bcada (?<n>\d+) semanas?\b/u;
const RE_EVERY_N_DAYS = /\bcada (?<n>\d+) dias?\b/u;
const RE_EVERY_N_MONTHS = /\bcada (?<n>\d+) meses?\b/u;
const RE_ONCE_PER = /\buna vez (?:por|al) (?<unit>dia|semana|mes)\b/u;

const RE_NEGATIVE = /\bno puedo\b|\bexcepto\b|\bmenos\b|\bsalvo\b/u;

const RE_ANCHOR_START = /\b(?:empezando|desde|arrancando)\s+(?<tail>.+)$/u;
const RE_ANCHOR_START_2 = /\ba partir de(?:l| la)?\s+(?<tail>.+)$/u;
const RE_ANCHOR_END = /\b(?:hasta|hasta el|hasta la)\s+(?<tail>.+)$/u;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DateDetection = {
  date?: DateExpression;
  spans: SourceSpan[];
};

type TimeDetection = {
  time?: TimeExpression;
  timeContext?: ParsedTemporalExpression["timeContext"];
  spans: SourceSpan[];
};

type RecurrenceDetection = {
  recurrence?: RecurrenceRule;
  spans: SourceSpan[];
};

type DurationDetection = {
  duration?: DurationExpression;
  spans: SourceSpan[];
};

function parseHour(
  hourText: string,
  minuteText = "00",
  options?: { inferAfternoon?: boolean; context?: ParsedTemporalExpression["timeContext"] }
): { value: string; hourAmbiguous: boolean } | undefined {
  let hour = Number.parseInt(hourText, 10);
  let hourAmbiguous = false;

  if (Number.isNaN(hour)) return undefined;

  const context = options?.context;
  if (context === "afternoon") {
    if (hour >= 1 && hour <= 11) hour += 12;
  } else if (context === "morning") {
    if (hour === 12) hour = 0;
  } else if (context === "night") {
    if (hour >= 1 && hour <= 11) hour += 12;
  } else if (context === "evening") {
    if (hour >= 1 && hour <= 11) hour += 12;
  } else if (options?.inferAfternoon && hour >= 1 && hour <= 7) {
    hour += 12;
  } else if (hour >= 1 && hour <= 6) {
    // Hours 1–6 without context are genuinely ambiguous between AM and PM
    // in es-AR usage. Hours 7–11 are overwhelmingly interpreted as AM;
    // hours 12–23 are unambiguous on a 24h clock.
    hourAmbiguous = true;
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

  return {
    value: `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    hourAmbiguous,
  };
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

// ---------------------------------------------------------------------------
// Time context detection (mañana/tarde/noche/madrugada)
// ---------------------------------------------------------------------------

function detectTimeContext(normalizedText: string): {
  context?: ParsedTemporalExpression["timeContext"];
  spans: SourceSpan[];
} {
  const morning = normalizedText.match(RE_MORNING_CONTEXT);
  if (morning) {
    return { context: "morning", spans: [toSourceSpan(normalizedText, morning)] };
  }
  const afternoon = normalizedText.match(RE_AFTERNOON_CONTEXT);
  if (afternoon) {
    return { context: "afternoon", spans: [toSourceSpan(normalizedText, afternoon)] };
  }
  const night = normalizedText.match(RE_NIGHT_CONTEXT);
  if (night) {
    return { context: "night", spans: [toSourceSpan(normalizedText, night)] };
  }
  const madrugada = normalizedText.match(RE_EARLY_MORNING_CONTEXT);
  if (madrugada) {
    return { context: "morning", spans: [toSourceSpan(normalizedText, madrugada)] };
  }
  return { spans: [] };
}

// ---------------------------------------------------------------------------
// Date detection
// ---------------------------------------------------------------------------

function buildIsoDateExpression(match: RegExpMatchArray): DateExpression | undefined {
  const day = Number.parseInt(match.groups?.day ?? "", 10);
  const month = Number.parseInt(match.groups?.month ?? "", 10);
  let year = Number.parseInt(match.groups?.year ?? "", 10);
  if (Number.isNaN(day) || Number.isNaN(month)) return undefined;
  if (Number.isNaN(year)) {
    return { kind: "absolute_date", day, month };
  }
  if (year < 100) year += 2000;
  return { kind: "absolute_date", day, month, year };
}

function detectDateExpression(normalizedText: string, corrections: Correction[]): DateDetection {
  // ISO date (2026-04-09)
  const isoMatch = normalizedText.match(RE_ISO_DATE);
  if (isoMatch?.groups) {
    const date = {
      kind: "absolute_date" as const,
      year: Number.parseInt(isoMatch.groups.year, 10),
      month: Number.parseInt(isoMatch.groups.month, 10),
      day: Number.parseInt(isoMatch.groups.day, 10),
    };
    return { date, spans: [toSourceSpan(normalizedText, isoMatch)] };
  }

  // Numeric date DD/MM/YYYY or DD-MM-YYYY
  const numericFullMatch = normalizedText.match(RE_NUMERIC_DATE_FULL);
  if (numericFullMatch?.groups) {
    const date = buildIsoDateExpression(numericFullMatch);
    if (date) {
      const core = `${numericFullMatch.groups.day}${numericFullMatch[0].includes("-") ? "-" : "/"}${numericFullMatch.groups.month}${numericFullMatch[0].includes("-") ? "-" : "/"}${numericFullMatch.groups.year}`;
      return {
        date,
        spans: [toCapturedSourceSpan(normalizedText, numericFullMatch, core)],
      };
    }
  }

  // Numeric date DD/MM
  const numericShortMatch = normalizedText.match(RE_NUMERIC_DATE_SHORT);
  if (numericShortMatch?.groups) {
    const date = buildIsoDateExpression(numericShortMatch);
    if (date) {
      const separator = numericShortMatch[0].includes("-") ? "-" : "/";
      const core = `${numericShortMatch.groups.day}${separator}${numericShortMatch.groups.month}`;
      return {
        date,
        spans: [toCapturedSourceSpan(normalizedText, numericShortMatch, core)],
      };
    }
  }

  // "9 de abril" / "jueves 9 de abril"
  const absoluteDateMatch = normalizedText.match(RE_ABSOLUTE_DATE);
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
        toCapturedSourceSpan(normalizedText, absoluteDateMatch, absoluteDateMatch.groups.core),
      ],
    };
  }

  // "lunes 6"
  const weekdayDayMatch = normalizedText.match(RE_WEEKDAY_DAY_OF_MONTH);
  if (weekdayDayMatch?.groups) {
    return {
      date: {
        kind: "day_of_month",
        day: Number.parseInt(weekdayDayMatch.groups.day, 10),
        weekday: WEEKDAY_BY_NAME[weekdayDayMatch.groups.weekday] ?? 1,
      },
      spans: [toCapturedSourceSpan(normalizedText, weekdayDayMatch, weekdayDayMatch.groups.core)],
    };
  }

  // "en N días/semanas/meses" / "dentro de N ..."
  const inDaysMatch = normalizedText.match(RE_IN_DAYS);
  if (inDaysMatch?.groups) {
    return {
      date: { kind: "in_days", days: Number.parseInt(inDaysMatch.groups.n, 10) },
      spans: [toSourceSpan(normalizedText, inDaysMatch)],
    };
  }
  const inWeeksMatch = normalizedText.match(RE_IN_WEEKS);
  if (inWeeksMatch?.groups) {
    return {
      date: { kind: "in_weeks", weeks: Number.parseInt(inWeeksMatch.groups.n, 10) },
      spans: [toSourceSpan(normalizedText, inWeeksMatch)],
    };
  }
  const inMonthsMatch = normalizedText.match(RE_IN_MONTHS);
  if (inMonthsMatch?.groups) {
    return {
      date: { kind: "in_months", months: Number.parseInt(inMonthsMatch.groups.n, 10) },
      spans: [toSourceSpan(normalizedText, inMonthsMatch)],
    };
  }

  // Ordinal nth weekday of the month
  const nthWeekdayMatch = normalizedText.match(RE_NTH_WEEKDAY_OF_MONTH);
  if (nthWeekdayMatch?.groups) {
    const ordinal = ORDINAL_BY_NAME[nthWeekdayMatch[1]] ?? 1;
    const weekday = WEEKDAY_BY_NAME[nthWeekdayMatch.groups.weekday] ?? 1;
    return {
      date: { kind: "nth_weekday_of_month", ordinal, weekday },
      spans: [toSourceSpan(normalizedText, nthWeekdayMatch)],
    };
  }

  // Month references
  const endOfMonthMatch = normalizedText.match(RE_END_OF_MONTH);
  if (endOfMonthMatch) {
    return {
      date: { kind: "end_of_month" },
      spans: [toSourceSpan(normalizedText, endOfMonthMatch)],
    };
  }
  const startOfMonthMatch = normalizedText.match(RE_START_OF_MONTH);
  if (startOfMonthMatch) {
    return {
      date: { kind: "start_of_month" },
      spans: [toSourceSpan(normalizedText, startOfMonthMatch)],
    };
  }
  const midMonthMatch = normalizedText.match(RE_MID_MONTH);
  if (midMonthMatch) {
    return {
      date: { kind: "mid_month" },
      spans: [toSourceSpan(normalizedText, midMonthMatch)],
    };
  }
  const nextMonthMatch = normalizedText.match(RE_NEXT_MONTH);
  if (nextMonthMatch) {
    return {
      date: { kind: "next_month" },
      spans: [toSourceSpan(normalizedText, nextMonthMatch)],
    };
  }
  const currentMonthMatch = normalizedText.match(RE_CURRENT_MONTH);
  if (currentMonthMatch) {
    return {
      date: { kind: "current_month" },
      spans: [toSourceSpan(normalizedText, currentMonthMatch)],
    };
  }
  const monthOfYearMatch = normalizedText.match(RE_MONTH_OF_YEAR);
  if (monthOfYearMatch) {
    const month = MONTH_BY_NAME[monthOfYearMatch[1]] ?? 1;
    const year = monthOfYearMatch.groups?.year
      ? Number.parseInt(monthOfYearMatch.groups.year, 10)
      : undefined;
    return {
      date: { kind: "month_of_year", month, year },
      spans: [toSourceSpan(normalizedText, monthOfYearMatch)],
    };
  }

  // "finde"
  const weekendMatch = normalizedText.match(RE_WEEKEND);
  if (weekendMatch) {
    return {
      date: { kind: "weekend" },
      spans: [toSourceSpan(normalizedText, weekendMatch)],
    };
  }

  const currentWeekMatch = normalizedText.match(RE_CURRENT_WEEK);
  if (currentWeekMatch) {
    return {
      date: { kind: "current_week" },
      spans: [toSourceSpan(normalizedText, currentWeekMatch)],
    };
  }

  const weekAfterNextMatch = normalizedText.match(RE_WEEK_AFTER_NEXT);
  if (weekAfterNextMatch) {
    return {
      date: { kind: "week_after_next" },
      spans: [toSourceSpan(normalizedText, weekAfterNextMatch)],
    };
  }

  const nextWeekMatch = normalizedText.match(RE_NEXT_WEEK);
  if (nextWeekMatch?.groups?.core) {
    return {
      date: { kind: "next_week" },
      spans: [toCapturedSourceSpan(normalizedText, nextWeekMatch, nextWeekMatch.groups.core)],
    };
  }

  const pastTomorrowMatch = normalizedText.match(RE_PAST_TOMORROW);
  if (pastTomorrowMatch) {
    return {
      date: { kind: "relative_day", offsetDays: 2 },
      spans: [toSourceSpan(normalizedText, pastTomorrowMatch)],
    };
  }

  const todayMatch = normalizedText.match(RE_TODAY);
  if (todayMatch) {
    return {
      date: { kind: "relative_day", offsetDays: 0 },
      spans: [toSourceSpan(normalizedText, todayMatch)],
    };
  }

  const tomorrowMatch = normalizedText.match(RE_TOMORROW);
  if (tomorrowMatch && !RE_MORNING_CONTEXT.test(normalizedText)) {
    return {
      date: { kind: "relative_day", offsetDays: 1 },
      spans: [toSourceSpan(normalizedText, tomorrowMatch)],
    };
  }

  // "de lunes a viernes"
  const weekdayRangeMatch = normalizedText.match(RE_WEEKDAY_RANGE);
  if (weekdayRangeMatch) {
    return {
      date: {
        kind: "weekday_range",
        fromWeekday: WEEKDAY_BY_NAME[weekdayRangeMatch[1]] ?? 1,
        toWeekday: WEEKDAY_BY_NAME[weekdayRangeMatch[2]] ?? 5,
      },
      spans: [toSourceSpan(normalizedText, weekdayRangeMatch)],
    };
  }

  // "lunes y miércoles" / "lunes, martes y jueves"
  const weekdayListMatch = normalizedText.match(RE_WEEKDAY_LIST);
  if (weekdayListMatch) {
    const names = weekdayListMatch[0].match(
      /\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/gu
    );
    if (names && names.length >= 2) {
      return {
        date: {
          kind: "weekdays",
          weekdays: names.map((name) => WEEKDAY_BY_NAME[name] ?? 1),
        },
        spans: [toSourceSpan(normalizedText, weekdayListMatch)],
      };
    }
  }

  const nextWeekWeekdayMatch = normalizedText.match(RE_NEXT_WEEK_WEEKDAY);
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

  const thisWeekdayMatch = normalizedText.match(RE_THIS_WEEKDAY);
  if (thisWeekdayMatch?.groups) {
    return {
      date: {
        kind: "this_weekday",
        weekday: WEEKDAY_BY_NAME[thisWeekdayMatch.groups.weekday] ?? 1,
      },
      spans: [toCapturedSourceSpan(normalizedText, thisWeekdayMatch, thisWeekdayMatch.groups.core)],
    };
  }

  const ambiguousNextWeekdayMatch = normalizedText.match(RE_AMBIGUOUS_NEXT_WEEKDAY);
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

  const weekdayMatch = normalizedText.match(RE_WEEKDAY);
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

// ---------------------------------------------------------------------------
// Time detection
// ---------------------------------------------------------------------------

function detectTimeExpression(
  normalizedText: string,
  timeContext: ParsedTemporalExpression["timeContext"]
): TimeDetection {
  // mediodía / medianoche
  const noonMatch = normalizedText.match(RE_NOON);
  if (noonMatch) {
    return {
      time: { kind: "exact_time", value: "12:00", isApproximate: false },
      spans: [toSourceSpan(normalizedText, noonMatch)],
    };
  }
  const midnightMatch = normalizedText.match(RE_MIDNIGHT);
  if (midnightMatch) {
    return {
      time: { kind: "exact_time", value: "00:00", isApproximate: false },
      spans: [toSourceSpan(normalizedText, midnightMatch)],
    };
  }

  // "entre X y Y"
  const betweenMatch = normalizedText.match(RE_BETWEEN_TIME);
  if (betweenMatch) {
    const from = parseHour(betweenMatch[1], betweenMatch[2] ?? "00", { context: timeContext });
    const to = parseHour(betweenMatch[3], betweenMatch[4] ?? "00", { context: timeContext });
    if (from && to) {
      return {
        time: {
          kind: "time_range",
          from: from.value,
          to: to.value,
          label: "entre",
          precision: "exact",
        },
        spans: [toSourceSpan(normalizedText, betweenMatch)],
      };
    }
  }

  // "de X a Y"
  const rangeMatch = normalizedText.match(RE_RANGE_TIME);
  if (rangeMatch) {
    const from = parseHour(rangeMatch[1], rangeMatch[2] ?? "00", { context: timeContext });
    const to = parseHour(rangeMatch[3], rangeMatch[4] ?? "00", { context: timeContext });
    if (from && to) {
      return {
        time: {
          kind: "time_range",
          from: from.value,
          to: to.value,
          label: "de_a",
          precision: "exact",
        },
        spans: [toSourceSpan(normalizedText, rangeMatch)],
      };
    }
  }

  const beforeHourMatch = normalizedText.match(RE_BEFORE_TIME);
  if (beforeHourMatch) {
    const to = parseHour(beforeHourMatch[1], beforeHourMatch[2] ?? "00", {
      context: timeContext,
    });
    if (to) {
      return {
        time: {
          kind: "time_range",
          from: "00:00",
          to: to.value,
          label: "antes_de",
          precision: "coarse",
        },
        spans: [toSourceSpan(normalizedText, beforeHourMatch)],
      };
    }
  }

  const afterHourMatch = normalizedText.match(RE_AFTER_TIME);
  if (afterHourMatch) {
    const from = parseHour(afterHourMatch[1], afterHourMatch[2] ?? "00", {
      context: timeContext,
    });
    if (from) {
      return {
        time: {
          kind: "time_range",
          from: from.value,
          to: "23:59",
          label: "despues_de",
          precision: "coarse",
        },
        spans: [toSourceSpan(normalizedText, afterHourMatch)],
      };
    }
  }

  // AM/PM explicit
  const ampmMatch = normalizedText.match(RE_HOUR_AMPM);
  if (ampmMatch) {
    const period = ampmMatch[3].toLowerCase();
    const context: ParsedTemporalExpression["timeContext"] = period.startsWith("p")
      ? "afternoon"
      : "morning";
    const value = parseHour(ampmMatch[1], ampmMatch[2] ?? "00", { context });
    if (value) {
      return {
        time: { kind: "exact_time", value: value.value, isApproximate: false },
        spans: [toSourceSpan(normalizedText, ampmMatch)],
      };
    }
  }

  // "y media" / "y cuarto" / "menos cuarto"
  const halfPastMatch = normalizedText.match(RE_HALF_PAST);
  if (halfPastMatch?.groups) {
    const parsed = parseHour(halfPastMatch.groups.h, "30", { context: timeContext });
    if (parsed) {
      return {
        time: {
          kind: "exact_time",
          value: parsed.value,
          isApproximate: false,
          ...(parsed.hourAmbiguous ? { hourAmbiguous: true } : {}),
        },
        spans: [toSourceSpan(normalizedText, halfPastMatch)],
      };
    }
  }
  const quarterPastMatch = normalizedText.match(RE_QUARTER_PAST);
  if (quarterPastMatch?.groups) {
    const parsed = parseHour(quarterPastMatch.groups.h, "15", { context: timeContext });
    if (parsed) {
      return {
        time: {
          kind: "exact_time",
          value: parsed.value,
          isApproximate: false,
          ...(parsed.hourAmbiguous ? { hourAmbiguous: true } : {}),
        },
        spans: [toSourceSpan(normalizedText, quarterPastMatch)],
      };
    }
  }
  const quarterToMatch = normalizedText.match(RE_QUARTER_TO);
  if (quarterToMatch?.groups) {
    const base = Number.parseInt(quarterToMatch.groups.h, 10);
    if (!Number.isNaN(base)) {
      // "3 menos cuarto" = 02:45
      const hour = (base + 23) % 24;
      const parsed = parseHour(String(hour), "45", { context: timeContext });
      if (parsed) {
        return {
          time: {
            kind: "exact_time",
            value: parsed.value,
            isApproximate: false,
            ...(parsed.hourAmbiguous ? { hourAmbiguous: true } : {}),
          },
          spans: [toSourceSpan(normalizedText, quarterToMatch)],
        };
      }
    }
  }

  // HH:MM (with optional "hs" suffix)
  const exactWithMinutesMatch = normalizedText.match(RE_EXACT_WITH_MINUTES);
  if (exactWithMinutesMatch) {
    const parsed = parseHour(exactWithMinutesMatch[1], exactWithMinutesMatch[2], {
      context: timeContext,
    });
    if (parsed) {
      return {
        time: {
          kind: "exact_time",
          value: parsed.value,
          isApproximate: false,
          // HH:MM with explicit minutes is treated as unambiguous when hour >= 13
          // or when a context exists; otherwise still flag as ambiguous.
          ...(parsed.hourAmbiguous ? { hourAmbiguous: true } : {}),
        },
        spans: [toSourceSpan(normalizedText, exactWithMinutesMatch)],
      };
    }
  }

  // "a las N"
  const exactHourMatch = normalizedText.match(RE_EXACT_HOUR);
  if (exactHourMatch) {
    const parsed = parseHour(exactHourMatch[1], "00", { context: timeContext });
    if (parsed) {
      return {
        time: {
          kind: "exact_time",
          value: parsed.value,
          isApproximate: false,
          ...(parsed.hourAmbiguous ? { hourAmbiguous: true } : {}),
        },
        spans: [toSourceSpan(normalizedText, exactHourMatch)],
      };
    }
  }

  // "15hs"
  const hsSuffixMatch = normalizedText.match(RE_HOUR_HS_SUFFIX);
  if (hsSuffixMatch) {
    const parsed = parseHour(hsSuffixMatch[1], "00", { context: timeContext });
    if (parsed) {
      return {
        time: {
          kind: "exact_time",
          value: parsed.value,
          isApproximate: false,
          ...(parsed.hourAmbiguous ? { hourAmbiguous: true } : {}),
        },
        spans: [toSourceSpan(normalizedText, hsSuffixMatch)],
      };
    }
  }

  // "tipo 3"
  const tipoHourMatch = normalizedText.match(RE_TIPO_HOUR);
  if (tipoHourMatch) {
    const parsed = parseHour(tipoHourMatch[1], tipoHourMatch[2] ?? "00", {
      inferAfternoon: true,
      context: timeContext,
    });
    if (parsed) {
      return {
        time: { kind: "exact_time", value: parsed.value, isApproximate: true },
        spans: [toSourceSpan(normalizedText, tipoHourMatch)],
      };
    }
  }

  // No explicit time: fall back to emitting the context as a time_range.
  if (timeContext === "morning") {
    return {
      time: {
        kind: "time_range",
        from: "08:00",
        to: "12:00",
        label: "manana",
        precision: "coarse",
      },
      spans: [],
      timeContext,
    };
  }
  if (timeContext === "afternoon") {
    return {
      time: {
        kind: "time_range",
        from: "13:00",
        to: "19:00",
        label: "tarde",
        precision: "coarse",
      },
      spans: [],
      timeContext,
    };
  }
  if (timeContext === "night") {
    return {
      time: {
        kind: "time_range",
        from: "20:00",
        to: "23:59",
        label: "noche",
        precision: "coarse",
      },
      spans: [],
      timeContext,
    };
  }

  return { spans: [] };
}

// ---------------------------------------------------------------------------
// Duration detection
// ---------------------------------------------------------------------------

function detectDurationExpression(normalizedText: string): DurationDetection {
  const halfHourMatch = normalizedText.match(RE_DURATION_HALF_HOUR);
  if (halfHourMatch) {
    return {
      duration: { kind: "duration", minutes: 30 },
      spans: [toSourceSpan(normalizedText, halfHourMatch)],
    };
  }
  const hoursMatch = normalizedText.match(RE_DURATION_HOURS);
  if (hoursMatch?.groups) {
    const hours = Number.parseFloat(hoursMatch.groups.n.replace(",", "."));
    if (!Number.isNaN(hours)) {
      return {
        duration: { kind: "duration", minutes: Math.round(hours * 60) },
        spans: [toSourceSpan(normalizedText, hoursMatch)],
      };
    }
  }
  const minutesMatch = normalizedText.match(RE_DURATION_MINUTES);
  if (minutesMatch?.groups) {
    const minutes = Number.parseInt(minutesMatch.groups.n, 10);
    if (!Number.isNaN(minutes)) {
      return {
        duration: { kind: "duration", minutes },
        spans: [toSourceSpan(normalizedText, minutesMatch)],
      };
    }
  }
  return { spans: [] };
}

// ---------------------------------------------------------------------------
// Recurrence detection
// ---------------------------------------------------------------------------

function detectRecurrenceExpression(normalizedText: string): RecurrenceDetection {
  const hasNegative = RE_NEGATIVE.test(normalizedText);

  // Daily — but "todos los días excepto/salvo los X" is an exclusion, not a
  // recurrence. Defer to date detection so the weekday becomes the excluded
  // one on an `availability_filter`.
  const dailyMatch = normalizedText.match(RE_DAILY_RECURRENCE);
  if (dailyMatch?.groups?.core && !hasNegative) {
    return {
      recurrence: { frequency: "daily", interval: 1 },
      spans: [toCapturedSourceSpan(normalizedText, dailyMatch, dailyMatch.groups.core)],
    };
  }

  // "cada N días/semanas/meses"
  const everyNWeeksMatch = normalizedText.match(RE_EVERY_N_WEEKS);
  if (everyNWeeksMatch?.groups) {
    return {
      recurrence: {
        frequency: "weekly",
        interval: Number.parseInt(everyNWeeksMatch.groups.n, 10),
      },
      spans: [toSourceSpan(normalizedText, everyNWeeksMatch)],
    };
  }
  const everyNDaysMatch = normalizedText.match(RE_EVERY_N_DAYS);
  if (everyNDaysMatch?.groups) {
    return {
      recurrence: {
        frequency: "daily",
        interval: Number.parseInt(everyNDaysMatch.groups.n, 10),
      },
      spans: [toSourceSpan(normalizedText, everyNDaysMatch)],
    };
  }
  const everyNMonthsMatch = normalizedText.match(RE_EVERY_N_MONTHS);
  if (everyNMonthsMatch?.groups) {
    return {
      recurrence: {
        frequency: "monthly",
        interval: Number.parseInt(everyNMonthsMatch.groups.n, 10),
      },
      spans: [toSourceSpan(normalizedText, everyNMonthsMatch)],
    };
  }
  const oncePerMatch = normalizedText.match(RE_ONCE_PER);
  if (oncePerMatch?.groups) {
    const unit = oncePerMatch.groups.unit;
    const frequency: RecurrenceRule["frequency"] =
      unit === "dia" ? "daily" : unit === "semana" ? "weekly" : "monthly";
    return {
      recurrence: { frequency, interval: 1 },
      spans: [toSourceSpan(normalizedText, oncePerMatch)],
    };
  }

  // Weekly with weekday(s)
  const weeklyMatch = normalizedText.match(RE_WEEKLY_RECURRENCE);
  if (!weeklyMatch?.groups?.core) {
    return { spans: [] };
  }

  const weekdays: number[] = [];
  if (weeklyMatch.groups.first) {
    weekdays.push(WEEKDAY_BY_NAME[weeklyMatch.groups.first] ?? 1);
  }
  if (weeklyMatch.groups.second) {
    weekdays.push(WEEKDAY_BY_NAME[weeklyMatch.groups.second] ?? 1);
  }

  return {
    recurrence: {
      frequency: "weekly",
      interval: 1,
      weekdays,
    },
    spans: [toCapturedSourceSpan(normalizedText, weeklyMatch, weeklyMatch.groups.core)],
  };
}

function detectAnchoredDate(
  normalizedText: string,
  corrections: Correction[],
  patterns: RegExp[]
): DateDetection {
  for (const pattern of patterns) {
    const anchorMatch = normalizedText.match(pattern);
    const rawTail = anchorMatch?.groups?.tail;
    if (!anchorMatch || !rawTail) continue;

    const detection = detectDateExpression(rawTail, corrections);
    if (!detection.date) continue;

    const fullStart = anchorMatch.index ?? normalizedText.indexOf(anchorMatch[0]);
    const tailStart = fullStart + anchorMatch[0].length - rawTail.length;

    return {
      date: detection.date,
      spans: offsetSpans(detection.spans, tailStart),
    };
  }

  return { spans: [] };
}

function detectRecurrenceStartExpression(
  normalizedText: string,
  corrections: Correction[]
): DateDetection {
  return detectAnchoredDate(normalizedText, corrections, [RE_ANCHOR_START, RE_ANCHOR_START_2]);
}

function detectRecurrenceUntilExpression(
  normalizedText: string,
  corrections: Correction[]
): DateDetection {
  return detectAnchoredDate(normalizedText, corrections, [RE_ANCHOR_END]);
}

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------

/**
 * Scan `normalizedText` for structured date / time / recurrence / duration
 * sub-expressions. Pure (no IO, no context-dependent resolution).
 */
export function detectTemporalExpression(
  normalizedText: string,
  corrections: Correction[] = []
): ParsedTemporalExpression {
  const recurrenceDetection = detectRecurrenceExpression(normalizedText);
  const timeContextDetection = detectTimeContext(normalizedText);
  const detectedTime = detectTimeExpression(normalizedText, timeContextDetection.context);
  const durationDetection = detectDurationExpression(normalizedText);
  const recurrenceStartDetection = recurrenceDetection.recurrence
    ? detectRecurrenceStartExpression(normalizedText, corrections)
    : { spans: [] };
  const recurrenceUntilDetection = recurrenceDetection.recurrence
    ? detectRecurrenceUntilExpression(normalizedText, corrections)
    : { spans: [] };
  const detectedDate = recurrenceDetection.recurrence
    ? { spans: [] }
    : detectDateExpression(normalizedText, corrections);

  // Merge context-only spans from the time detector (only if the detector
  // actually produced a time but without a surface span).
  const timeSpans = detectedTime.spans.length > 0 ? detectedTime.spans : timeContextDetection.spans;

  return {
    sourceSpans: uniqueSpans([
      ...recurrenceDetection.spans,
      ...detectedDate.spans,
      ...recurrenceStartDetection.spans,
      ...recurrenceUntilDetection.spans,
      ...timeSpans,
      ...durationDetection.spans,
    ]),
    recurrence: recurrenceDetection.recurrence,
    recurrenceStart: recurrenceStartDetection.date,
    recurrenceUntil: recurrenceUntilDetection.date,
    date: detectedDate.date,
    time: detectedTime.time,
    timeContext: timeContextDetection.context,
    duration: durationDetection.duration,
    negative: RE_NEGATIVE.test(normalizedText),
  };
}
