export type ParseMode = "strict" | "tolerant";

export type ParseContext = {
  referenceDateTime: string;
  timezone: string;
  locale?: string;
  mode?: ParseMode;
};

export type CorrectionReason = "abbreviation" | "typo";

export type Correction = {
  from: string;
  to: string;
  reason: CorrectionReason;
};

export type ParseWarning = {
  code: string;
  message: string;
};

export type ParseError = {
  code: string;
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

export type SourceSpan = {
  text: string;
  start: number;
  end: number;
};

export type RecurrenceRule = {
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  weekdays?: number[];
};

export type TemporalCandidate = {
  kind: "date" | "datetime" | "date_range" | "availability_filter" | "recurrence";
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
  sourceSpans?: SourceSpan[];
  selectionHints?: SelectionHints;
  recurrence?: RecurrenceRule;
  ambiguityReason?: string;
};

export type ParseResult = {
  normalizedText: string;
  corrections: Correction[];
  candidates: TemporalCandidate[];
  warnings: ParseWarning[];
  errors: ParseError[];
};

export type NormalizedInput = {
  originalText: string;
  normalizedText: string;
  corrections: Correction[];
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
  | { kind: "this_weekday"; weekday: number }
  | { kind: "next_week_weekday"; weekday: number }
  | { kind: "ambiguous_next_weekday"; weekday: number };

export type TimeExpression =
  | {
      kind: "exact_time";
      value: string;
      isApproximate: boolean;
    }
  | {
      kind: "time_range";
      from: string;
      to: string;
      label: string;
      precision: "coarse" | "exact" | "approximate";
    };

export type ParsedTemporalExpression = {
  date?: DateExpression;
  time?: TimeExpression;
  sourceSpans: SourceSpan[];
  recurrence?: RecurrenceRule;
  recurrenceStart?: DateExpression;
  negative?: boolean;
};
