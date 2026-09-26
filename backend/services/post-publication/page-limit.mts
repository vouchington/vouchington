/** Literal row budgets let generic prepared plans cost an actual early stop. */
export function publicationPageLimit(limit: number): string {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new TypeError('Publication page limit must be a positive safe integer')
  return String(limit)
}
