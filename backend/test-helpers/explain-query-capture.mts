import {
  clearCapturedQueries,
  disableQueryCapture,
  enableQueryCapture,
  getCapturedQueries,
  writePool,
} from '@data-stores/psql'

/** Exercise native pool queries while a caller-owned capture adapter is installed. */
export async function runRawPoolCaptureProbe(
  installCapture: () => () => void,
  callbackError?: Error,
): Promise<{
  beforeRestore: Array<{ text: string; values: readonly unknown[] }>
  afterRestore: Array<{ text: string; values: readonly unknown[] }>
  reacquiredSameClient: boolean
  sameWrapperAfterReacquire: boolean
  restoredOriginalQuery: boolean
  error: unknown
}> {
  const initial = await writePool.connect()
  const originalQuery = initial.query
  initial.release()
  clearCapturedQueries()
  enableQueryCapture()
  const restore = installCapture()
  const first = await writePool.connect()
  const wrapped = first.query
  let second = first
  let error: unknown
  try {
    await first.query('/* rawCaptureString */ SELECT $1::text AS value', ['string-value'])
    await first.query({ text: '/* rawCaptureConfig */ SELECT $1::integer AS value', values: [42] })
    await first.query('/* rawCaptureIgnored */ SELECT $1::text AS value', ['ignored'])
    first.release()
    second = await writePool.connect()
    await second.query('/* rawCaptureString */ SELECT $1::text AS value', ['reacquired'])
    if (callbackError) throw callbackError
  } catch (err) {
    error = err
  }
  const beforeRestore = getCapturedQueries().slice()
  const reacquiredSameClient = initial === first && first === second
  const sameWrapperAfterReacquire = second.query === wrapped
  restore()
  const restoredOriginalQuery = second.query === originalQuery
  try {
    await second.query('/* rawCaptureString */ SELECT $1::text AS value', ['after-restore'])
    return {
      beforeRestore,
      afterRestore: getCapturedQueries(),
      reacquiredSameClient,
      sameWrapperAfterReacquire,
      restoredOriginalQuery,
      error,
    }
  } finally {
    second.release()
    disableQueryCapture()
  }
}
