# fechero

Structured Spanish date parsing for scheduling engines.

`fechero` is a deterministic parser for informal Spanish temporal expressions, designed for booking flows and WhatsApp-style input. It keeps ambiguity explicit, records conservative typo corrections, and returns structured candidates instead of a single opaque `Date`.

## What it handles today

- Relative dates like `hoy`, `mañana`, `pasado mañana`
- Absolute dates like `9 de abril` and `jueves 9 de abril`
- Broad ranges like `la semana que viene` and `finde`
- Human week expressions like `esta semana`, `la otra semana`, `este jueves`, `el martes que viene`
- Weekdays like `martes` and ambiguous phrases like `próximo viernes`
- Exact clock times like `a las 16:30`, `16:30`, and approximate times like `tipo 3`
- Named time ranges like `a la mañana` and `a la tarde`
- Open-ended constraints like `después de las 18` and `antes de las 18`
- Weekly recurrence like `todos los martes`
- Negative constraints like `excepto los martes` or `los martes a la mañana no puedo`
- Conservative typo handling using explicit replacements plus Levenshtein matching over a small temporal lexicon

## Install

```bash
pnpm add fechero
```

## Usage

```ts
import { parseSpanishDate, resolveBestCandidate } from "fechero";

const parsed = parseSpanishDate("próximo viernes", {
  referenceDateTime: "2026-03-31T10:00:00-03:00",
  timezone: "America/Argentina/Buenos_Aires",
  locale: "es-AR",
});

console.log(parsed.candidates);
console.log(resolveBestCandidate(parsed));
```

```ts
import {
  parseSpanishDate,
  toAvailabilityFilters,
  toExclusionFilters,
  toTemporalConstraints,
} from "fechero";

parseSpanishDate("los martes a la mañana no puedo", {
  referenceDateTime: "2026-03-31T10:00:00-03:00",
  timezone: "America/Argentina/Buenos_Aires",
  locale: "es",
});

// {
//   normalizedText: "los martes a la manana no puedo",
//   corrections: [],
//   candidates: [
//     {
//       kind: "availability_filter",
//       excludedWeekdays: [2],
//       timeRange: { from: "08:00", to: "12:00", label: "manana", precision: "coarse" }
//     }
//   ],
//   warnings: [],
//   errors: []
// }

const parsed = parseSpanishDate("este jueves a la tarde", {
  referenceDateTime: "2026-03-31T10:00:00-03:00",
  timezone: "America/Argentina/Buenos_Aires",
  locale: "es",
});

toAvailabilityFilters(parsed, { weekdayConvention: "sunday-0" });
toExclusionFilters(parsed, { weekdayConvention: "sunday-0" });
toTemporalConstraints(parsed, { weekdayConvention: "sunday-0" });
```

## Result shape

`parseSpanishDate()` returns:

- `normalizedText`
- `corrections[]`
- `candidates[]`
- `warnings[]`
- `errors[]`

Candidate kinds currently exposed:

- `date`
- `datetime`
- `date_range`
- `availability_filter`
- `recurrence`

Candidate metadata currently exposed:

- `exactStartTime`
- `isApproximate`
- `sourceSpans`

Scheduling helpers:

- `toAvailabilityFilters()`
- `toExclusionFilters()`
- `toTemporalConstraints()`

## Design notes

- The parser is deterministic. It does not depend on an LLM.
- Typo correction is intentionally conservative and limited to a domain lexicon.
- Ambiguous expressions stay ambiguous in the output.
- A separate resolver helper is available when a consumer wants a single best candidate.
- Weekday output conventions can be adapted in helpers, including `sunday-0` for common scheduling systems.

## Current limits

- v1.1 is optimized for `es-AR`, but accepts broader `es` locale input
- The lexicon and rule set are still intentionally small
- Expressions that require external calendars, holidays, or locale-specific business logic are not resolved yet

## Development

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Release

```bash
pnpm release:check
pnpm release:dry-run
pnpm release:publish
```

Notes:

- `release:check` runs typecheck, tests, build, and `npm pack --dry-run`
- `release:dry-run` exercises the npm publish flow without pushing to npm
- `release:publish` publishes with public access once the repo is ready
- once the remote repository exists, add `repository`, `homepage`, and `bugs` fields to `package.json`
