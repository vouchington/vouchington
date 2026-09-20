export function calculateTokenCostUsd(tokens: number, ratePerMillionUsd: number): number {
  if (!Number.isFinite(tokens) || tokens < 0) {
    throw new Error('Tokens must be a non-negative finite number.')
  }
  if (!Number.isFinite(ratePerMillionUsd) || ratePerMillionUsd < 0) {
    throw new Error('Input rate must be a non-negative finite number.')
  }
  return (tokens / 1_000_000) * ratePerMillionUsd
}
