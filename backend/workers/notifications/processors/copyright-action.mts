import { processCopyrightActionIntent } from '@services/copyright-notices'

export async function processApplyCopyrightAction(data: {
  intentId: string
}): Promise<'applied' | 'stale' | 'blocked' | 'not_claimed'> {
  return processCopyrightActionIntent(data.intentId, new Date())
}
