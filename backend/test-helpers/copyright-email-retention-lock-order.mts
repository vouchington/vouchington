import type pg from 'pg'
import { writePool } from '@data-stores/psql'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'

/** Start a writer after the marker UPDATE, retaining either valid outcome if erasure aborts. */
export async function waitForCopyrightEmailMarkerBeforeWriter<T, WriterResult>(
  intakeId: string,
  erase: () => Promise<T>,
  append: () => Promise<WriterResult>,
  writerStatementMarker = '/* appendCopyrightEmailIntakeRecommendation:lockIntake */',
): Promise<{ erasure: PromiseSettledResult<T>; appended: PromiseSettledResult<WriterResult> }> {
  return runPoolObservationExclusively(async () => {
    const markerWritten = Promise.withResolvers<void>()
    const writerDispatched = Promise.withResolvers<void>()
    const releaseMarker = Promise.withResolvers<void>()
    const restorations = new Map<pg.PoolClient, () => void>()
    const observe = (client: pg.PoolClient) => {
      if (restorations.has(client)) return
      const descriptor = Object.getOwnPropertyDescriptor(client, 'query')
      const original = client.query
      restorations.set(client, () => {
        if (descriptor) Object.defineProperty(client, 'query', descriptor)
        else Reflect.deleteProperty(client, 'query')
      })
      const query = ((...args: unknown[]) => {
        const statement = args[0]
        const text =
          typeof statement === 'object' && statement !== null && 'text' in statement
            ? statement.text
            : statement
        const values =
          typeof statement === 'object' && statement !== null && 'values' in statement
            ? statement.values
            : null
        const pending = Reflect.apply(original, client, args)
        if (
          typeof text === 'string' &&
          text.includes('/* markUnlinkedCopyrightEmailReceiptErased */')
        )
          return Promise.resolve(pending).then(async value => {
            markerWritten.resolve()
            await releaseMarker.promise
            return value
          })
        if (
          typeof text === 'string' &&
          text.includes(writerStatementMarker) &&
          Array.isArray(values) &&
          values.includes(intakeId)
        )
          writerDispatched.resolve()
        return pending
      }) as pg.PoolClient['query']
      Object.defineProperty(client, 'query', { configurable: true, writable: true, value: query })
    }
    writePool.on('acquire', observe)
    const erasure = erase()
    let writer: Promise<WriterResult> | undefined
    try {
      const settledErasure = Promise.allSettled([erasure]).then(([result]) => result!)
      await Promise.race([markerWritten.promise, settledErasure])
      writer = append()
      const settledWriter = Promise.allSettled([writer]).then(([result]) => result!)
      await Promise.race([writerDispatched.promise, settledWriter])
      releaseMarker.resolve()
      return { erasure: await settledErasure, appended: await settledWriter }
    } finally {
      releaseMarker.resolve()
      await erasure.catch(() => undefined)
      await writer?.catch(() => undefined)
      writePool.off('acquire', observe)
      for (const restore of restorations.values()) restore()
    }
  })
}
