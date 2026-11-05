export type TrustTier = 'trusted' | 'neutral' | 'distrusted' | 'unrated'

export function getTrustTier(scoreNet: number, countUp: number, countDown: number): TrustTier {
  if (countUp + countDown === 0) return 'unrated'
  if (scoreNet >= 3 && countUp >= 5) return 'trusted'
  if (scoreNet <= -3) return 'distrusted'
  return 'neutral'
}

const trustLabels: Record<TrustTier, string> = {
  trusted: 'Trusted',
  neutral: 'Neutral',
  distrusted: 'Distrusted',
  unrated: 'Unrated',
}

export function getTrustLabel(tier: TrustTier): string {
  return trustLabels[tier]
}
