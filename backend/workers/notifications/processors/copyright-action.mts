import { processCopyrightActionIntent } from '@services/copyright-notices'
import { invokeProcessor } from './invoke-at.mts'

type ApplyCopyrightActionDependencies = {
  processCopyrightActionIntent: typeof processCopyrightActionIntent
  now: () => Date
}

export async function processApplyCopyrightAction(
  data: { intentId: string },
  dependencies: Partial<ApplyCopyrightActionDependencies> = {},
): Promise<'applied' | 'stale' | 'blocked' | 'not_claimed'> {
  return invokeProcessor(
    data.intentId,
    { process: dependencies.processCopyrightActionIntent, now: dependencies.now },
    processCopyrightActionIntent,
  )
}
