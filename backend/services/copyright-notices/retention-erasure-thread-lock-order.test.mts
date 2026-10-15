import { beginTransaction } from '@voucha/test-helpers'
import { createRetentionEmailCase } from '@voucha/test-helpers/services/copyright-notices/retention-email-case'
import { describe, expect, it } from 'vitest'
import { insertCopyrightEmailThreadReferences } from './email-thread-ancestors.mts'
import { buildCopyrightEmailThreadReferenceRows } from './email-thread-references.mts'
import { lockCopyrightRetentionCaseThreadTokens } from './retention-erasure-thread-tokens.mts'

describe('copyright erasure thread-token fence', () => {
  it('defers a case that gained an intake token before its notice lock', async () => {
    const entry = await createRetentionEmailCase()
    await using erasure = await beginTransaction()
    const candidateRead = Promise.withResolvers<void>()
    const releaseCandidate = Promise.withResolvers<void>()
    let firstRead = true
    const observed = new Proxy(erasure, {
      apply(target, thisArgument, argumentsList) {
        const input = argumentsList[0]
        const statement = typeof input === 'string' ? input : input.text
        const result = Reflect.apply(target, thisArgument, argumentsList)
        if (!firstRead || !statement.includes('/* caseThreadTokenDigests */')) return result
        firstRead = false
        return Promise.resolve(result).then(async value => {
          candidateRead.resolve()
          await releaseCandidate.promise
          return value
        })
      },
    })

    const pending = lockCopyrightRetentionCaseThreadTokens(observed, entry.noticeId)
    try {
      await candidateRead.promise
      await using ingestion = await beginTransaction()
      await insertCopyrightEmailThreadReferences(
        ingestion,
        entry.intakeId,
        buildCopyrightEmailThreadReferenceRows({
          messageId: `<${crypto.randomUUID()}@example.test>`,
          inReplyTo: [],
          references: [],
        }),
      )
      await ingestion.commit()
    } finally {
      releaseCandidate.resolve()
    }

    await expect(pending).resolves.toBe(false)
    await erasure.rollback()
  })
})
