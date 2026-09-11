export async function measureSequential(count: number, operation: () => Promise<unknown>) {
  const samples: number[] = []
  for (let index = 0; index < count; index += 1) {
    const startedAt = performance.now()
    await operation()
    samples.push(performance.now() - startedAt)
  }
  return samples
}

export async function measureBurst(
  requestCount: number,
  concurrency: number,
  launchCadenceMs: number,
  operation: () => Promise<unknown>,
) {
  const samples = new Array<number>(requestCount)
  await new Promise<void>((resolve, reject) => {
    let active = 0
    let completed = 0
    let launched = 0
    let timer: NodeJS.Timeout | undefined
    const launchNext = () => {
      if (launched >= requestCount) {
        if (completed === requestCount) resolve()
        if (timer) clearInterval(timer)
        return
      }
      if (active >= concurrency) return
      const index = launched++
      active++
      const startedAt = performance.now()
      operation()
        .then(() => {
          samples[index] = performance.now() - startedAt
          active--
          completed++
          if (completed === requestCount) {
            if (timer) clearInterval(timer)
            resolve()
          }
        })
        .catch(error => {
          if (timer) clearInterval(timer)
          reject(error)
        })
    }
    launchNext()
    timer = setInterval(launchNext, launchCadenceMs)
  })
  return samples
}

export function summarize(rawMs: number[]) {
  const sorted = rawMs.toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return {
    rawMs,
    medianMs:
      sorted.length % 2 === 0
        ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
        : sorted[middle],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  }
}

export function maximum(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values)
}

export function effectiveRows(plan: unknown): number {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return 0
  const node = plan as Record<string, unknown>
  const removedRows =
    Number(node['Rows Removed by Filter'] ?? 0) + Number(node['Rows Removed by Index Recheck'] ?? 0)
  const own = (Number(node['Actual Rows'] ?? 0) + removedRows) * Number(node['Actual Loops'] ?? 1)
  const children = [
    ...(Array.isArray(node.Plans) ? node.Plans : []),
    ...(node.Plan ? [node.Plan] : []),
  ]
  return children.reduce((sum, child) => sum + effectiveRows(child), own)
}
