/**
 * Parsing mode.
 *
 * - `tolerant` (default): applies typo corrections and emits multiple candidates
 *   when the input is ambiguous.
 * - `strict`: rejects inputs that required a typo correction or that would
 *   produce more than one candidate. In that case {@link ParseResult.errors}
 *   contains a `STRICT_MODE_REJECTED` entry and `candidates` is empty.
 */
export type ParseMode = "strict" | "tolerant";

/**
 * Caller-supplied context that grounds every parse call in a concrete instant,
 * timezone and locale. All date math happens relative to this reference.
 */
export type ParseContext = {
  /** ISO-8601 instant used as "now" for relative expressions. */
  referenceDateTime: string;
  /** IANA timezone, e.g. `America/Argentina/Buenos_Aires`. */
  timezone: string;
  /** BCP-47 locale. Currently only `es` / `es-AR` are fully supported. */
  locale?: string;
  /** See {@link ParseMode}. Defaults to `tolerant`. */
  mode?: ParseMode;
};

export type CorrectionReason = "abbreviation" | "typo";

export type Correction = {
  from: string;
  to: string;
  reason: CorrectionReason;
};

/** Known warning codes emitted by the parser. */
export type WarningCode =
  | "WEEKDAY_DATE_MISMATCH"
  | "YEAR_INFERRED"
  | "HOUR_AM_PM_AMBIGUOUS"
  | "STRICT_MODE_TYPO"
  | "STRICT_MODE_AMBIGUOUS";

/** Known error codes emitted by the parser. */
export type ErrorCode =
  | "NO_TEMPORAL_EXPRESSION"
  | "INVALID_DAY_OF_MONTH"
  | "INVALID_TIME"
  | "INVALID_REFERENCE_DATETIME"
  | "INVALID_TIMEZONE"
  | "STRICT_MODE_REJECTED";

export type ParseWarning = {
  code: WarningCode;
  message: string;
};

export type ParseError = {
  code: ErrorCode;
  message: string;
};

export type TimeRange = {
  from: string;
  to: string;
  label: string;
  precision: "coarse" | "exact" | "approximate";
};

export type ExactDateSource = "literal_absolute" | "literal_relative" | "inferred";

export type ExactStartTimeSource = "literal_exact" | "literal_approximate" | "inferred";

export type DateRangeSource = "literal_range" | "inferred";

export type SelectionHints = {
  mentionsExactDate: boolean;
  mentionsExactTime: boolean;
  mentionsRelativeWeekday: boolean;
  mentionsRange: boolean;
};

/**
 * A span of text that contributed to a candidate. Coordinates on the
 * normalized text are always present. When a mapping back to the original
 * input is available, `originalStart` / `originalEnd` are also provided.
 */
export type SourceSpan = {
  text: string;
  start: number;
  end: number;
  originalText?: string;
  originalStart?: number;
  originalEnd?: number;
};

export type RecurrenceRule = {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  weekdays?: number[];
  /** Optional bound for the recurrence, exclusive. ISO `YYYY-MM-DD`. */
  until?: string;
};

export type TemporalCandidate = {
  kind: "date" | "datetime" | "date_range" | "availability_filter" | "recurrence" | "duration";
  confidence: number;
  exactDate?: string;
  exactDateSource?: ExactDateSource;
  dateFrom?: string;
  dateTo?: string;
  dateRangeSource?: DateRangeSource;
  exactStartTime?: string;
  exactStartTimeSource?: ExactStartTimeSource;
  isApproximate?: boolean;
  timeRange?: TimeRange;
  allowedWeekdays?: number[];
  excludedWeekdays?: number[];
  excludedDates?: string[];
  /** Duration in minutes, for `kind: "duration"` or datetimes with a length. */
  durationMinutes?: number;
  sourceSpans?: SourceSpan[];
  selectionHints?: SelectionHints;
  recurrence?: RecurrenceRule;
  ambiguityReason?: string;
  warnings?: ParseWarning[];
};

export type ParseResult = {
  normalizedText: string;
  originalText: string;
  corrections: Correction[];
  candidates: TemporalCandidate[];
  warnings: ParseWarning[];
  errors: ParseError[];
};

export type NormalizedInput = {
  originalText: string;
  normalizedText: string;
  corrections: Correction[];
  /**
   * For each character index in `normalizedText`, the corresponding character
   * index in `originalText`. Inserted characters (e.g. from abbreviation
   * expansions) are represented by the insertion point in the original.
   */
  normalizedToOriginal: number[];
};

export type DateExpression =
  | { kind: "relative_day"; offsetDays: number }
  | { kind: "absolute_date"; day: number; month: number; year?: number; weekday?: number }
  | { kind: "day_of_month"; day: number; weekday?: number }
  | { kind: "current_week" }
  | { kind: "next_week" }
  | { kind: "week_after_next" }
  | { kind: "weekend" }
  | { kind: "weekday"; weekday: number }
  | { kind: "weekdays"; weekdays: number[] }
  | { kind: "weekday_range"; fromWeekday: number; toWeekday: number }
  | { kind: "this_weekday"; weekday: number }
  | { kind: "next_week_weekday"; weekday: number }
  | { kind: "ambiguous_next_weekday"; weekday: number }
  | { kind: "current_month" }
  | { kind: "next_month" }
  | { kind: "month_of_year"; month: number; year?: number }
  | { kind: "end_of_month" }
  | { kind: "start_of_month" }
  | { kind: "mid_month" }
  | { kind: "nth_weekday_of_month"; ordinal: number; weekday: number; month?: number }
  | { kind: "in_days"; days: number }
  | { kind: "in_weeks"; weeks: number }
  | { kind: "in_months"; months: number };

export type TimeExpression =
  | {
      kind: "exact_time";
      value: string;
      isApproximate: boolean;
      /** True when the hour was given as 1–11 without AM/PM context. */
      hourAmbiguous?: boolean;
    }
  | {
      kind: "time_range";
      from: string;
      to: string;
      label: string;
      precision: "coarse" | "exact" | "approximate";
    };

export type DurationExpression = {
  kind: "duration";
  minutes: number;
};

export type ParsedTemporalExpression = {
  date?: DateExpression;
  time?: TimeExpression;
  /** Time-of-day context (mañana, tarde, noche) used to disambiguate hours. */
  timeContext?: "morning" | "afternoon" | "evening" | "night";
  duration?: DurationExpression;
  sourceSpans: SourceSpan[];
  recurrence?: RecurrenceRule;
  recurrenceStart?: DateExpression;
  recurrenceUntil?: DateExpression;
  negative?: boolean;
};
