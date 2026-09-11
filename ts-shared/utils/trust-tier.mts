export type TrustTier = 'trusted' | 'neutral' | 'distrusted' | 'unrated'

export function getTrustTier(scoreNet: number, countUp: number, countDown: number): TrustTier {
  if (countUp + countDown === 0) return 'unrated'
  if (scoreNet >= 3 && countUp >= 5) return 'trusted'
  if (scoreNet <= -3) return 'distrusted'
  return 'neutral'
}

export function getTrustLabel(tier: TrustTier): string {
  switch (tier) {
    case 'trusted':
      return 'Trusted'
    case 'neutral':
      return 'Neutral'
    case 'distrusted':
      return 'Distrusted'
    case 'unrated':
      return 'Unrated'
  }
}
