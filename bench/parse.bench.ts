import { bench, describe } from "vitest";

import { parseSpanishDate } from "../src/index";

const context = {
  referenceDateTime: "2026-03-31T10:00:00-03:00",
  timezone: "America/Argentina/Buenos_Aires",
  locale: "es" as const,
};

const fixtures: string[] = [
  "mañana a las 15",
  "9 de abril",
  "próximo viernes",
  "la semana que viene por la tarde",
  "todos los martes a las 17",
  "el primer lunes del mes",
  "de lunes a viernes a la tarde",
  "2026-04-09 10:30",
  "dentro de 2 semanas",
  "el lunes a las 10 y el jueves a las 15",
];

describe("parseSpanishDate", () => {
  for (const fixture of fixtures) {
    bench(fixture, () => {
      parseSpanishDate(fixture, context);
    });
  }
});
