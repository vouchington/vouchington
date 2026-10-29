import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { beginTransaction, writePool } from '@data-stores/psql'
import sql from 'sql-template-strings'
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
      const { rows } = await writer<{ id: string }>(sql`
        /* writeCopyrightEmailDuringErasure */
        INSERT INTO copyright_notice_email_intake_recommendations
          (copyright_notice_email_intake_receipt_id, input_sha256, prompt_version, model,
           structured_output_ciphertext)
        VALUES (${intakeId}, ${Buffer.alloc(32, 7)}, ${randomUUID()},
          'lock-order-test', 'v1:lock-order-test') RETURNING id`)
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
