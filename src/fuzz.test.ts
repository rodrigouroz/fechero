import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseSpanishDate, toTemporalOutput } from "./index";

const context = {
  referenceDateTime: "2026-03-31T10:00:00-03:00",
  timezone: "America/Argentina/Buenos_Aires",
  locale: "es" as const,
};

// A small vocabulary of temporal + filler tokens, so fast-check generates
// strings that exercise real parser paths instead of pure noise.
const TEMPORAL_TOKENS = [
  "hoy",
  "mañana",
  "pasado",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
  "semana",
  "finde",
  "próximo",
  "que",
  "viene",
  "a",
  "las",
  "de",
  "la",
  "por",
  "tarde",
  "mañana",
  "noche",
  "al",
  "mediodía",
  "medianoche",
  "10",
  "15",
  "3",
  "9:30",
  "16:45",
  "entre",
  "y",
  "cuarto",
  "media",
  "abril",
  "mayo",
  "fin",
  "mes",
  "antes",
  "después",
  "todos",
  "los",
  "cada",
  "2",
  "en",
  "dentro",
  "dias",
  "días",
  "semanas",
  "salvo",
  "excepto",
  "no",
  "puedo",
  "con",
  "Juan",
  "hola",
  ",",
  ".",
  ";",
  "?",
];

const arbitraryTemporalPhrase = fc
  .array(fc.constantFrom(...TEMPORAL_TOKENS), { minLength: 1, maxLength: 8 })
  .map((tokens) => tokens.join(" "));

const arbitraryNoise = fc.string({ minLength: 0, maxLength: 60 });

describe("parseSpanishDate — property tests", () => {
  it("never throws on arbitrary unicode strings", () => {
    fc.assert(
      fc.property(arbitraryNoise, (input) => {
        parseSpanishDate(input, context);
      }),
      { numRuns: 500 }
    );
  });

  it("never throws on arbitrary temporal-flavoured phrases", () => {
    fc.assert(
      fc.property(arbitraryTemporalPhrase, (input) => {
        parseSpanishDate(input, context);
      }),
      { numRuns: 500 }
    );
  });

  it("always returns a well-formed result shape", () => {
    fc.assert(
      fc.property(arbitraryTemporalPhrase, (input) => {
        const result = parseSpanishDate(input, context);
        expect(result).toHaveProperty("normalizedText");
        expect(result).toHaveProperty("originalText", input);
        expect(Array.isArray(result.candidates)).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
        expect(Array.isArray(result.errors)).toBe(true);
      }),
      { numRuns: 300 }
    );
  });

  it("sourceSpans always stay inside the normalized text range", () => {
    fc.assert(
      fc.property(arbitraryTemporalPhrase, (input) => {
        const result = parseSpanishDate(input, context);
        for (const candidate of result.candidates) {
          for (const span of candidate.sourceSpans ?? []) {
            expect(span.start).toBeGreaterThanOrEqual(0);
            expect(span.end).toBeGreaterThanOrEqual(span.start);
            expect(span.end).toBeLessThanOrEqual(result.normalizedText.length);
            // The captured text should be a substring of the normalized text.
            expect(result.normalizedText.slice(span.start, span.end)).toBe(span.text);
          }
        }
      }),
      { numRuns: 300 }
    );
  });

  it("originalSpans, when present, stay inside the original input", () => {
    fc.assert(
      fc.property(arbitraryTemporalPhrase, (input) => {
        const result = parseSpanishDate(input, context);
        for (const candidate of result.candidates) {
          for (const span of candidate.sourceSpans ?? []) {
            if (span.originalStart !== undefined && span.originalEnd !== undefined) {
              expect(span.originalStart).toBeGreaterThanOrEqual(0);
              expect(span.originalEnd).toBeGreaterThanOrEqual(span.originalStart);
              expect(span.originalEnd).toBeLessThanOrEqual(input.length);
            }
          }
        }
      }),
      { numRuns: 300 }
    );
  });

  it("every candidate has a confidence in [0, 1]", () => {
    fc.assert(
      fc.property(arbitraryTemporalPhrase, (input) => {
        const result = parseSpanishDate(input, context);
        for (const candidate of result.candidates) {
          expect(candidate.confidence).toBeGreaterThanOrEqual(0);
          expect(candidate.confidence).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 300 }
    );
  });

  it("exactDate fields parse back as valid ISO dates", () => {
    fc.assert(
      fc.property(arbitraryTemporalPhrase, (input) => {
        const result = parseSpanishDate(input, context);
        for (const candidate of result.candidates) {
          if (candidate.exactDate) {
            expect(candidate.exactDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          }
          if (candidate.dateFrom) {
            expect(candidate.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          }
          if (candidate.dateTo) {
            expect(candidate.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          }
        }
      }),
      { numRuns: 300 }
    );
  });

  it("exactStartTime fields are HH:MM with valid ranges", () => {
    fc.assert(
      fc.property(arbitraryTemporalPhrase, (input) => {
        const result = parseSpanishDate(input, context);
        for (const candidate of result.candidates) {
          if (candidate.exactStartTime) {
            const match = candidate.exactStartTime.match(/^(\d{2}):(\d{2})$/);
            expect(match).not.toBeNull();
            if (match) {
              const hour = Number.parseInt(match[1], 10);
              const minute = Number.parseInt(match[2], 10);
              expect(hour).toBeGreaterThanOrEqual(0);
              expect(hour).toBeLessThanOrEqual(23);
              expect(minute).toBeGreaterThanOrEqual(0);
              expect(minute).toBeLessThanOrEqual(59);
            }
          }
        }
      }),
      { numRuns: 300 }
    );
  });

  it("toTemporalOutput never throws on any parse result", () => {
    fc.assert(
      fc.property(arbitraryTemporalPhrase, (input) => {
        const parsed = parseSpanishDate(input, context);
        toTemporalOutput(parsed);
        toTemporalOutput(parsed, { preserveAmbiguity: false });
        toTemporalOutput(parsed, { weekdayConvention: "sunday-0" });
      }),
      { numRuns: 300 }
    );
  });

  it("parse is deterministic for the same input", () => {
    fc.assert(
      fc.property(arbitraryTemporalPhrase, (input) => {
        const a = parseSpanishDate(input, context);
        const b = parseSpanishDate(input, context);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
      { numRuns: 200 }
    );
  });
});
