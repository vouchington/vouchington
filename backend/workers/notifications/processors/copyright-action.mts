import { processCopyrightActionIntent } from '@services/copyright-notices'
import { invokeAt } from './invoke-at.mts'

type ApplyCopyrightActionDependencies = {
  processCopyrightActionIntent: typeof processCopyrightActionIntent
  now: () => Date
}

export async function processApplyCopyrightAction(
  data: { intentId: string },
  dependencies: Partial<ApplyCopyrightActionDependencies> = {},
): Promise<'applied' | 'stale' | 'blocked' | 'not_claimed'> {
  const process = dependencies.processCopyrightActionIntent ?? processCopyrightActionIntent
  return invokeAt(now => process(data.intentId, now), dependencies.now)
}
