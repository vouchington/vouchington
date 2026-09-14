/** Stay inside the i18n-extract-codemod 30s testTimeout (#11686). Production --check has no cap. */
export const I18N_ANALYSIS_BUDGET_MS = 25_000

export type AnalysisBudgetClock = {
  delay: (ms: number) => Promise<never>
}

export type AnalysisBudgetOptions = {
  budgetMs?: number
  clock?: AnalysisBudgetClock
  now?: () => number
  startedAt?: number
}

const defaultClock: AnalysisBudgetClock = {
  delay: ms =>
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`no-mistakes analysis exceeded ${ms}ms`))
      }, ms)
      timer.unref()
    }),
}

function isHostLockMessage(message: string): boolean {
  return /waiting for lock held by pid/i.test(message) || /invocation\.lock/i.test(message)
}

export async function withI18nAnalysisBudget<T>(
  label: string,
  work: Promise<T>,
  options: AnalysisBudgetOptions = {},
): Promise<T> {
  const clock = options.clock ?? defaultClock
  const now = options.now ?? (() => performance.now())
  const at = now()
  const budgetMs =
    options.budgetMs === undefined
      ? undefined
      : Math.max(0, options.budgetMs - (at - (options.startedAt ?? at)))
  const timeout =
    budgetMs === undefined
      ? undefined
      : clock.delay(budgetMs).then(
          () => {
            throw new Error(`no-mistakes ${label} exceeded ${budgetMs}ms`)
          },
          () => {
            throw new Error(
              `no-mistakes ${label} exceeded ${budgetMs}ms (lock wait or hung analysis)`,
            )
          },
        )
  timeout?.catch(() => undefined)
  try {
    return await (timeout === undefined ? work : Promise.race([work, timeout]))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isHostLockMessage(message)) {
      throw new Error(`no-mistakes ${label} blocked on host lock: ${message}`, { cause: error })
    }
    throw error
  }
}
