import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { beginTransaction, writePool } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'

/** Hold the live intake while erasure requests it, then write through the real receipt guard. */
export async function writeCopyrightEmailDuringErasure<T>(
  intakeId: string,
  erase: () => Promise<T>,
): Promise<{ erasure: T; recommendationId: string }> {
  return runPoolObservationExclusively(async () => {
    const erasureAtIntake = Promise.withResolvers<void>()
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
        const pending = Reflect.apply(original, client, args)
        if (
          typeof statement === 'object' &&
          statement !== null &&
          'text' in statement &&
          typeof statement.text === 'string' &&
          statement.text.includes('/* lockUnlinkedCopyrightEmailIntake */') &&
          'values' in statement &&
          Array.isArray(statement.values) &&
          statement.values.includes(intakeId)
        )
          erasureAtIntake.resolve()
        return pending
      }) as pg.PoolClient['query']
      Object.defineProperty(client, 'query', { configurable: true, writable: true, value: query })
    }
    writePool.on('acquire', observe)
    const writer = await beginTransaction()
    let erasure: Promise<T> | undefined
    try {
      await writer(sql`/* holdCopyrightEmailIntakeBeforeErasure */
        SELECT id FROM copyright_notice_email_intakes WHERE id = ${intakeId} FOR UPDATE`)
      erasure = erase()
      void erasure.catch(err => erasureAtIntake.reject(err))
      await erasureAtIntake.promise
      const recommendationId = uuidv7()
      const inputSha256 = Buffer.alloc(32, 7)
      const promptVersion = randomUUID()
      await writer(sql`/* writeCopyrightEmailDuringErasure:identity */
        INSERT INTO copyright_notice_email_intake_recommendation_identities
          (id, copyright_notice_email_intake_receipt_id, input_sha256, prompt_version)
        VALUES (${recommendationId}, ${intakeId}, ${inputSha256}, ${promptVersion})`)
      const { rows } = await writer<{ id: string }>(sql`
        /* writeCopyrightEmailDuringErasure */
        INSERT INTO copyright_notice_email_intake_recommendations
          (id, copyright_notice_email_intake_receipt_id, input_sha256, prompt_version, model,
           structured_output_ciphertext)
        VALUES (${recommendationId}, ${intakeId}, ${inputSha256}, ${promptVersion},
          'lock-order-test', 'v1:lock-order-test') RETURNING id`)
      await writer(sql`/* writeCopyrightEmailDuringErasure:owner */
        UPDATE copyright_notice_email_intakes SET
          current_recommendation_identity_id = ${recommendationId},
          current_recommendation_output_ciphertext = 'v1:lock-order-test',
          recommendation_completed_at = CURRENT_TIMESTAMP
        WHERE id = ${intakeId}`)
      await writer.commit()
      return { erasure: await erasure, recommendationId: rows[0]!.id }
    } finally {
      await writer[Symbol.asyncDispose]()
      await erasure?.catch(() => undefined)
      writePool.off('acquire', observe)
      for (const restore of restorations.values()) restore()
    }
  })
}

/** Commit the real erasure marker while an agent write waits on the same intake lock. */
export async function waitForCopyrightEmailMarkerBeforeWriter<T>(
  intakeId: string,
  erase: () => Promise<T>,
  append: () => Promise<boolean>,
): Promise<{ erasure: T; appended: boolean }> {
  return runPoolObservationExclusively(async () => {
    const markerWritten = Promise.withResolvers<void>()
    const writerWaiting = Promise.withResolvers<void>()
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
          text.includes('/* appendCopyrightEmailIntakeRecommendation:lockIntake */') &&
          Array.isArray(values) &&
          values.includes(intakeId)
        )
          writerWaiting.resolve()
        return pending
      }) as pg.PoolClient['query']
      Object.defineProperty(client, 'query', { configurable: true, writable: true, value: query })
    }
    writePool.on('acquire', observe)
    const erasure = erase()
    let writer: Promise<boolean> | undefined
    try {
      void erasure.catch(err => markerWritten.reject(err))
      await markerWritten.promise
      writer = append()
      void writer.catch(err => writerWaiting.reject(err))
      await writerWaiting.promise
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
