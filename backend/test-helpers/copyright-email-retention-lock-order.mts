import type pg from 'pg'
import { writePool } from '@data-stores/psql'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'

/** Start a writer after the marker UPDATE, retaining either valid outcome if erasure aborts. */
export async function waitForCopyrightEmailMarkerBeforeWriter<T, WriterResult>(
  intakeId: string,
  erase: () => Promise<T>,
  append: () => Promise<WriterResult>,
  writerStatementMarker = '/* appendCopyrightEmailIntakeRecommendation:lockIntake */',
): Promise<{ erasure: T; appended: WriterResult }> {
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
      void erasure.catch((err: unknown) => markerWritten.reject(err))
      const marked = await Promise.race([
        markerWritten.promise.then(() => true),
        erasure.then(() => false),
      ])
      if (!marked) return { erasure: await erasure, appended: await append() }
      writer = append()
      void writer.catch((err: unknown) => writerDispatched.reject(err))
      await writerDispatched.promise
      releaseMarker.resolve()
      return { erasure: await erasure, appended: await writer }
    } finally {
      releaseMarker.resolve()
      await erasure.catch(() => undefined)
      await writer?.catch(() => undefined)
      writePool.off('acquire', observe)
      for (const restore of restorations.values()) restore()
    }
  })
}
