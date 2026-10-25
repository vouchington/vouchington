import type pg from 'pg'
import { writePool } from '@data-stores/psql'
import { appendCopyrightEmailIntakeRecommendation } from '../services/copyright-notices/email-recommendations.mts'
import { linkCopyrightEmailIntakeToNotice } from '../services/copyright-notices/email-threading.mts'
import { markTestCopyrightNoticeErasedAndCommit } from './copyright-email-manual-association.mts'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'

/** Commit a real link after the writer reads its absent link, before it takes the intake lock. */
export async function appendCopyrightEmailAfterConcurrentLink(
  input: Parameters<typeof appendCopyrightEmailIntakeRecommendation>[0],
  noticeId: string,
  erased: boolean,
): Promise<boolean> {
  return runPoolObservationExclusively(async () => {
    let linked = false
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
        const ownsLinkRead =
          !linked &&
          typeof statement === 'object' &&
          statement !== null &&
          'text' in statement &&
          typeof statement.text === 'string' &&
          statement.text.includes('/* appendCopyrightEmailIntakeRecommendation:link */') &&
          'values' in statement &&
          Array.isArray(statement.values) &&
          statement.values.includes(input.intakeId)
        const pending = Reflect.apply(original, client, args)
        if (!ownsLinkRead) return pending
        linked = true
        return Promise.resolve(pending).then(async result => {
          const inserted = await linkCopyrightEmailIntakeToNotice({
            intakeId: input.intakeId,
            noticeId,
            linkKind: 'thread',
          })
          if (!inserted) throw new Error('Expected owned concurrent thread link')
          if (erased) await markTestCopyrightNoticeErasedAndCommit(noticeId)
          return result
        })
      }) as pg.PoolClient['query']
      Object.defineProperty(client, 'query', { configurable: true, writable: true, value: query })
    }
    writePool.on('acquire', observe)
    try {
      const result = await appendCopyrightEmailIntakeRecommendation(input)
      if (!linked) throw new Error('Email writer never read the owned initial link')
      return result
    } finally {
      writePool.off('acquire', observe)
      for (const restore of restorations.values()) restore()
    }
  })
}
