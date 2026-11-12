/** Approximate text token count using four UTF-16 code units per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
