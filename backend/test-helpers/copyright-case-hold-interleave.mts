import type pg from 'pg'
import { read, writePool } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'

/** Commit a real hold after this case's proof read, before its next marker statement. */
export async function holdCopyrightCaseAfterPurgeProof<Result>(
  noticeId: string,
  placeHold: () => Promise<unknown>,
  purge: () => Promise<Result>,
  queryMarker = 'readCopyrightCasePurgeEligibility',
): Promise<Result> {
  return runPoolObservationExclusively(async () => {
    let placed = false
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
          placed ||
          typeof statement !== 'object' ||
          statement === null ||
          !('text' in statement) ||
          typeof statement.text !== 'string' ||
          !statement.text.includes(`/* ${queryMarker} */`) ||
          !('values' in statement) ||
          !Array.isArray(statement.values) ||
          !statement.values.includes(noticeId)
        )
          return pending
        placed = true
        return Promise.resolve(pending).then(async result => {
          await placeHold()
          return result
        })
      }) as pg.PoolClient['query']
      Object.defineProperty(client, 'query', { configurable: true, writable: true, value: query })
    }
    writePool.on('acquire', observe)
    try {
      const result = await purge()
      if (!placed) throw new Error('Owned purge did not read its eligibility proof')
      return result
    } finally {
      writePool.off('acquire', observe)
      for (const restore of restorations.values()) restore()
    }
  })
}

/** The existing registry proof cursor for one owned evidence object. */
export async function readCopyrightStorageClaimProof(storageKey: string) {
  const { rows } = await read<{
    id: string
    generation: string
    claimed: boolean
  }>(sql`/* readCopyrightStorageClaimProof */
    SELECT id, reference_generation::text AS generation, is_deletion_claimed AS claimed
    FROM copyright_notice_storage_objects WHERE storage_key = ${storageKey}`)
  if (!rows[0]) throw new Error('Owned copyright storage object is missing')
  return rows[0]
}
