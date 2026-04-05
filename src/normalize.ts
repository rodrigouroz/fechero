import type { Correction, NormalizedInput } from "./types";

/**
 * Explicit token-level replacements. These always fire when the (lowercased,
 * accent-stripped) token matches exactly, regardless of fuzzy scoring.
 */
const TOKEN_REPLACEMENTS = new Map<string, Correction>([
  ["prox", { from: "prox", to: "proximo", reason: "abbreviation" }],
  ["prx", { from: "prx", to: "proximo", reason: "abbreviation" }],
  ["dsps", { from: "dsps", to: "despues", reason: "abbreviation" }],
  ["dps", { from: "dps", to: "despues", reason: "abbreviation" }],
  ["x", { from: "x", to: "por", reason: "abbreviation" }],
  ["xq", { from: "xq", to: "porque", reason: "abbreviation" }],
  ["mñn", { from: "mñn", to: "manana", reason: "abbreviation" }],
  ["mnn", { from: "mnn", to: "manana", reason: "abbreviation" }],
  ["hs", { from: "hs", to: "horas", reason: "abbreviation" }],
  ["hr", { from: "hr", to: "hora", reason: "abbreviation" }],
  ["hrs", { from: "hrs", to: "horas", reason: "abbreviation" }],
  ["min", { from: "min", to: "minutos", reason: "abbreviation" }],
  ["mins", { from: "mins", to: "minutos", reason: "abbreviation" }],
]);

/**
 * Tokens the fuzzy matcher is allowed to snap to. Kept intentionally small:
 * every entry here is a word we are willing to corrupt neighbours into.
 *
 * NOTE: `tarde` is deliberately excluded even though it is a temporal word,
 * because it is close enough to many unrelated Spanish words (`darte`,
 * `parte`, `arte`, ...) that allowing fuzzy snapping produces incorrect
 * rewrites. It is still handled by exact matching downstream. `manana` is
 * kept because "mñana" → "mnana" → "manana" is a very common typo and its
 * near neighbours are captured by {@link FUZZY_BLOCKLIST}.
 */
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
  "proxima",
  "finde",
  "antes",
  "despues",
  "excepto",
  "todos",
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
  "semana",
  "mes",
  "ano",
];

/**
 * Words that should NEVER be fuzzy-corrected, even when they are close to a
 * lexicon entry. This is the main defence against silent corruption.
 */
const FUZZY_BLOCKLIST = new Set([
  "darte",
  "parte",
  "parto",
  "arte",
  "carta",
  "carto",
  "harto",
  "sabana",
  "banana",
  "canas",
  "cenas",
  "ganas",
  "lanas",
  "manas",
  "ranas",
  "vacas",
  "junes",
  "lunas",
  "linea",
  "lineas",
  "linaje",
  "martas",
  "martin",
  "marta",
  "marte",
  "juntes",
  "juguete",
  "puente",
  "puentes",
  "frente",
  "frentes",
  "gente",
  "mente",
  "suerte",
  "muerte",
  "verte",
  "verde",
  "perder",
  "vender",
  "aprender",
]);

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Two-row Levenshtein distance. Allocates O(min(m,n)) rather than O(m*n).
 */
function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  // Ensure `right` is the shorter string to minimize allocations.
  if (right.length > left.length) {
    const swap = left;
    left = right;
    right = swap;
  }

  const previous = new Array<number>(right.length + 1);
  const current = new Array<number>(right.length + 1);

  for (let column = 0; column <= right.length; column += 1) {
    previous[column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + substitutionCost
      );
    }
    for (let column = 0; column <= right.length; column += 1) {
      previous[column] = current[column];
    }
  }

  return previous[right.length];
}

function typoThreshold(token: string): number {
  if (token.length <= 4) return 1;
  if (token.length <= 6) return 1;
  return 2;
}

function fuzzyTemporalCorrection(token: string): string | undefined {
  if (token.length < 4 || /^\d+$/.test(token)) return undefined;
  if (FUZZY_BLOCKLIST.has(token)) return undefined;
  // If the token exactly matches a lexicon entry it is already fine.
  if (TEMPORAL_LEXICON.includes(token)) return undefined;

  let winner: string | undefined;
  let winnerDistance = Number.POSITIVE_INFINITY;
  const threshold = typoThreshold(token);

  for (const candidate of TEMPORAL_LEXICON) {
    if (Math.abs(token.length - candidate.length) > 1) continue;

    const distance = levenshtein(token, candidate);
    if (distance > threshold) continue;

    if (distance < winnerDistance) {
      winner = candidate;
      winnerDistance = distance;
      continue;
    }

    if (distance === winnerDistance) {
      // Tie: bail out rather than pick arbitrarily.
      winner = undefined;
    }
  }

  return winner;
}

/**
 * Normalize `input` for the downstream detector.
 *
 * Produces:
 * - `normalizedText`: lowercased, accent-stripped, whitespace-collapsed,
 *   with abbreviations expanded and conservative typo corrections applied.
 * - `corrections`: ordered list of every rewrite that took place.
 * - `normalizedToOriginal`: index map from every character in
 *   `normalizedText` back to a character position in `originalText`. Inserted
 *   characters point to the insertion site in the original.
 */
export function normalizeInput(input: string): NormalizedInput {
  const originalText = input;

  // Step 1: lowercase + accent strip while tracking the character mapping
  // back to the original. Neither operation changes character count, so the
  // mapping after this step is identity minus positions that got collapsed.
  const lowered = originalText.toLowerCase();
  const stripped = stripAccents(lowered);
  // stripAccents can drop combining marks — when that happens we need to map
  // each resulting char back to the original. Rebuild by iterating code points.
  let strippedText = "";
  const strippedToOriginal: number[] = [];
  for (let index = 0; index < lowered.length; index += 1) {
    const char = stripAccents(lowered[index]);
    if (char.length === 0) continue;
    strippedText += char;
    for (let inner = 0; inner < char.length; inner += 1) {
      strippedToOriginal.push(index);
    }
  }
  // Sanity: `strippedText` should equal `stripped` modulo combining-mark quirks.
  // If they differ fall back to the naïve path.
  const base = strippedText.length === stripped.length ? strippedText : stripped;
  const baseToOriginal =
    strippedText.length === stripped.length
      ? strippedToOriginal
      : stripped.split("").map((_, index) => Math.min(index, originalText.length - 1));

  // Step 2: collapse whitespace. Track mapping through the collapse.
  const collapsed: string[] = [];
  const collapsedToOriginal: number[] = [];
  let previousWasSpace = true; // trim leading
  for (let index = 0; index < base.length; index += 1) {
    const char = base[index];
    const isSpace = /\s/.test(char);
    if (isSpace) {
      if (previousWasSpace) continue;
      collapsed.push(" ");
      collapsedToOriginal.push(baseToOriginal[index] ?? 0);
      previousWasSpace = true;
    } else {
      collapsed.push(char);
      collapsedToOriginal.push(baseToOriginal[index] ?? 0);
      previousWasSpace = false;
    }
  }
  // Trim trailing space
  if (collapsed[collapsed.length - 1] === " ") {
    collapsed.pop();
    collapsedToOriginal.pop();
  }
  const collapsedText = collapsed.join("");

  // Step 3: token-level rewrites (abbreviations + fuzzy typos). Keep the index
  // map in sync: when a token is rewritten, every character of the replacement
  // maps to the start position of the original token.
  const corrections: Correction[] = [];
  const finalChars: string[] = [];
  const finalToOriginal: number[] = [];

  let cursor = 0;
  while (cursor < collapsedText.length) {
    // Skip spaces (preserve them).
    if (collapsedText[cursor] === " ") {
      finalChars.push(" ");
      finalToOriginal.push(collapsedToOriginal[cursor]);
      cursor += 1;
      continue;
    }

    // Grab next token.
    let end = cursor;
    while (end < collapsedText.length && collapsedText[end] !== " ") end += 1;
    const token = collapsedText.slice(cursor, end);
    const tokenStartOriginal = collapsedToOriginal[cursor] ?? 0;

    const explicit = TOKEN_REPLACEMENTS.get(token);
    let replacement: string | undefined;
    let reason: "abbreviation" | "typo" | undefined;

    if (explicit) {
      replacement = explicit.to;
      reason = explicit.reason;
      corrections.push({ from: token, to: explicit.to, reason: explicit.reason });
    } else {
      const fuzzy = fuzzyTemporalCorrection(token);
      if (fuzzy && fuzzy !== token) {
        replacement = fuzzy;
        reason = "typo";
        corrections.push({ from: token, to: fuzzy, reason: "typo" });
      }
    }

    if (replacement !== undefined) {
      for (let index = 0; index < replacement.length; index += 1) {
        finalChars.push(replacement[index]);
        finalToOriginal.push(tokenStartOriginal);
      }
    } else {
      for (let index = cursor; index < end; index += 1) {
        finalChars.push(collapsedText[index]);
        finalToOriginal.push(collapsedToOriginal[index]);
      }
    }
    // Silence unused-var lint on `reason`.
    void reason;

    cursor = end;
  }

  return {
    originalText,
    normalizedText: finalChars.join(""),
    corrections,
    normalizedToOriginal: finalToOriginal,
  };
}
