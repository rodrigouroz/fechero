# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`fechero` is a deterministic parser for informal Spanish (primarily `es-AR`) temporal expressions, designed for scheduling/booking flows. It returns structured candidates instead of a single `Date`, keeping ambiguity explicit. No LLM dependency.

Runtime target: Node >= 20, ESM + CJS dual build via `tsup`. Single runtime dep: `@js-temporal/polyfill`.

## Commands

```bash
pnpm test                    # vitest run (one-shot)
pnpm test:watch              # vitest watch mode
pnpm vitest run src/parse-spanish-date.test.ts   # single test file
pnpm vitest run -t "pattern" # run tests matching a name
pnpm bench                   # run bench/*.bench.ts benchmarks
pnpm typecheck               # tsc --noEmit
pnpm build                   # tsup (produces dist/ ESM + CJS + d.ts)
pnpm release:check           # typecheck + test + build + npm pack --dry-run
pnpm release:dry-run         # npm publish --dry-run
pnpm release:publish         # publish to npm (public)
```

`prepublishOnly` runs `release:check` automatically.

## Architecture

The parser is a linear pipeline of pure functions, all orchestrated by `parseSpanishDate()` in `src/parse.ts`:

1. **`normalize.ts`** — Lowercases, strips diacritics, applies explicit replacements plus Levenshtein matching against a small temporal lexicon. Emits `corrections[]` (conservative, domain-scoped).
2. **`detect.ts`** — `detectTemporalExpression()` scans the normalized text and extracts a structured expression (absolute/relative date parts, weekday, time, range, recurrence start, constraints). This layer does not resolve against the reference datetime.
3. **`interpret.ts`** — `interpretTemporalExpression(expression, context)` resolves the detected expression into concrete `TemporalCandidate[]` using the caller-provided `ParseContext` (`referenceDateTime`, `timezone`, `locale`). Uses `Temporal.PlainDate` / `Temporal.ZonedDateTime` for all date math — never `Date`.
4. **`parse.ts`** — Combines the above and runs post-checks like `WEEKDAY_DATE_MISMATCH` (weekday given but contradicts the resolved absolute date).

Downstream helpers operate on the `ParseResult`:

- **`resolve.ts`** — `resolveBestCandidate()` picks a single best candidate when the consumer does not want to deal with ambiguity themselves.
- **`scheduling-helpers.ts`** — `toTemporalOutput()`, `toAvailabilityFilters()`, `toExclusionFilters()`, `toTemporalConstraints()`. These convert candidates into shapes consumable by schedulers, including configurable `weekdayConvention` (e.g. `sunday-0` for systems that index Sunday as 0).

### Candidate kinds

`TemporalCandidate` (see `src/types.ts`) is a discriminated union with `kind` ∈ `date | datetime | date_range | availability_filter | recurrence | duration`. Candidates carry provenance (`sourceSpans`, `exactStartTime`, `isApproximate`, per-candidate `warnings`). Ambiguity is preserved as multiple candidates rather than collapsed.

`SourceSpan` carries dual coordinates: `start` / `end` reference the normalized text, and when normalization was lossy (accents stripped, abbreviations expanded) the span also carries `originalStart` / `originalEnd` / `originalText` referencing the raw input. Equal coordinates are omitted to keep the default shape stable.

### Error and warning codes

All codes are exported as string literal unions from `src/types.ts` (`ErrorCode`, `WarningCode`). Consumers can discriminate exhaustively instead of comparing raw strings.

### Strict vs tolerant mode

`context.mode = "strict"` rejects any parse that required a typo correction or that would return more than one candidate, replacing them with a `STRICT_MODE_REJECTED` error. Use this when the upstream flow cannot tolerate ambiguity (e.g. non-interactive batch jobs).

### Hour AM/PM disambiguation

Hours 1–6 without an explicit `de la tarde` / `de la noche` / `de la mañana` / `am` / `pm` context are flagged `hourAmbiguous` during detection and expanded by `interpret.ts` into two `datetime` candidates (AM and PM), each carrying `ambiguityReason: "hour_am_pm"` and a `HOUR_AM_PM_AMBIGUOUS` warning. Hours 7–11 are treated as AM by default (matching es-AR usage); 12 maps to noon; 13–23 are unambiguous. Context words disambiguate before expansion happens.

### Design invariants

- **Deterministic.** No network, no LLM, no locale data beyond the in-repo lexicon.
- **Ambiguity is explicit.** Do not collapse multiple candidates inside `interpret.ts`; let the resolver/helpers decide.
- **Typo correction stays conservative** — scoped to the temporal lexicon. Do not expand it into general-purpose spellcheck.
- **All date math goes through `Temporal.*`** from `@js-temporal/polyfill`. Avoid `Date`.
- **`es-AR` is primary**, but broader `es` input must still parse.

## Tests

Vitest specs live beside the code (`src/*.test.ts`). `parse-spanish-date.test.ts` is the integration surface — most behavioral changes should add a case there. `resolve-best-candidate.test.ts` and `temporal-output.test.ts` cover the resolver and scheduling-helper output shapes respectively.
