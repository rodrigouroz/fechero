import { describe, expect, it } from "vitest";

import { normalizeInput } from "./normalize";

describe("normalizeInput", () => {
  it("lowercases, strips accents, and collapses whitespace", () => {
    const result = normalizeInput("  Próximo   Martes  ");
    expect(result.normalizedText).toBe("proximo martes");
    expect(result.corrections).toEqual([]);
  });

  it("preserves the mapping back to the original text", () => {
    const result = normalizeInput("mañana");
    // "mañana" has 6 characters; after NFD the ñ becomes n + combining tilde,
    // which is stripped. Our map should still point every normalized char
    // into a valid original index.
    expect(result.normalizedText).toBe("manana");
    expect(result.normalizedToOriginal).toHaveLength("manana".length);
    for (const index of result.normalizedToOriginal) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan("mañana".length);
    }
  });

  it("expands known abbreviations", () => {
    const result = normalizeInput("prox martes");
    expect(result.normalizedText).toBe("proximo martes");
    expect(result.corrections).toEqual([{ from: "prox", to: "proximo", reason: "abbreviation" }]);
  });

  it("applies fuzzy typo correction within the lexicon threshold", () => {
    const result = normalizeInput("vierns");
    expect(result.normalizedText).toBe("viernes");
    expect(result.corrections).toEqual([{ from: "vierns", to: "viernes", reason: "typo" }]);
  });

  it("never corrects common non-temporal Spanish words", () => {
    // `darte`, `parte`, `arte` are close to the removed `tarde`; these must
    // remain untouched so adjacent text is not silently rewritten.
    for (const word of ["darte", "parte", "arte", "carta", "sabana", "banana"]) {
      expect(normalizeInput(word).normalizedText).toBe(word);
      expect(normalizeInput(word).corrections).toEqual([]);
    }
  });

  it("does not fuzzy-correct exact lexicon members", () => {
    const result = normalizeInput("lunes");
    expect(result.corrections).toEqual([]);
  });

  it("bails out of fuzzy correction on ties", () => {
    // A token that is equidistant from two lexicon entries should not be
    // silently snapped to either.
    const result = normalizeInput("xxxxxx");
    expect(result.normalizedText).toBe("xxxxxx");
    expect(result.corrections).toEqual([]);
  });
});
