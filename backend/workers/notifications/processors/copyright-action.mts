import { processCopyrightActionIntent } from '@services/copyright-notices'

type ApplyCopyrightActionDependencies = {
  processCopyrightActionIntent: typeof processCopyrightActionIntent
  now: () => Date
}

export async function processApplyCopyrightAction(
  data: { intentId: string },
  dependencies: Partial<ApplyCopyrightActionDependencies> = {},
): Promise<'applied' | 'stale' | 'blocked' | 'not_claimed'> {
  const process = dependencies.processCopyrightActionIntent ?? processCopyrightActionIntent
  const now = dependencies.now ?? (() => new Date())
  return await process(data.intentId, now())
}
