import { describe, expect, it } from "vitest";

import { parseSpanishDate, resolveBestCandidate } from "./index";

const context = {
  referenceDateTime: "2026-03-31T10:00:00-03:00",
  timezone: "America/Argentina/Buenos_Aires",
  locale: "es-AR" as const,
};

describe("resolveBestCandidate", () => {
  it("prefers the highest confidence candidate by default", () => {
    const parsed = parseSpanishDate("próximo viernes", context);

    expect(resolveBestCandidate(parsed)).toMatchObject({
      exactDate: "2026-04-03",
    });
  });
});
