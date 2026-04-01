import type { Correction, NormalizedInput } from "./types";

const TOKEN_REPLACEMENTS = new Map<string, Correction>([
  [
    "prox",
    {
      from: "prox",
      to: "proximo",
      reason: "abbreviation",
    },
  ],
  [
    "prx",
    {
      from: "prx",
      to: "proximo",
      reason: "abbreviation",
    },
  ],
  [
    "dsps",
    {
      from: "dsps",
      to: "despues",
      reason: "abbreviation",
    },
  ],
]);

const TEMPORAL_LEXICON = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "hoy",
  "manana",
  "pasado",
  "proximo",
  "finde",
  "despues",
  "excepto",
  "todos",
  "tarde",
];

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function levenshtein(left: string, right: string): number {
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0)
  );

  for (let row = 0; row <= left.length; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column <= right.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );
    }
  }

  return matrix[left.length][right.length];
}

function typoThreshold(token: string): number {
  if (token.length <= 4) {
    return 1;
  }

  if (token.length <= 7) {
    return 2;
  }

  return 2;
}

function fuzzyTemporalCorrection(token: string): string | undefined {
  if (token.length < 4 || /^\d+$/.test(token)) {
    return undefined;
  }

  let winner: string | undefined;
  let winnerDistance = Number.POSITIVE_INFINITY;

  for (const candidate of TEMPORAL_LEXICON) {
    if (Math.abs(token.length - candidate.length) > 1) {
      continue;
    }

    const distance = levenshtein(token, candidate);
    if (distance > typoThreshold(token)) {
      continue;
    }

    if (distance < winnerDistance) {
      winner = candidate;
      winnerDistance = distance;
      continue;
    }

    if (distance === winnerDistance) {
      winner = undefined;
    }
  }

  return winner;
}

export function normalizeInput(input: string): NormalizedInput {
  const collapsed = input.trim().toLowerCase().replace(/\s+/g, " ");
  const stripped = stripAccents(collapsed);
  const corrections: Correction[] = [];

  const normalizedText = stripped
    .split(" ")
    .map((token) => {
      const correction = TOKEN_REPLACEMENTS.get(token);
      if (!correction) {
        const fuzzy = fuzzyTemporalCorrection(token);
        if (!fuzzy || fuzzy === token) {
          return token;
        }

        corrections.push({
          from: token,
          to: fuzzy,
          reason: "typo",
        });
        return fuzzy;
      }

      corrections.push(correction);
      return correction.to;
    })
    .join(" ");

  return {
    originalText: input,
    normalizedText,
    corrections,
  };
}
