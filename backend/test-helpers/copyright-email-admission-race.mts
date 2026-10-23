import type pg from 'pg'
import { writePool } from '@data-stores/psql'
import { appendCopyrightEmailIntakeRecommendation } from '../services/copyright-notices/email-recommendations.mts'
import { admitCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-admission.mts'
import { runPoolObservationExclusively } from './postgres-pool-observation-queue.mts'

/** Hold the recommender's actual notice lock until admission requests its own notice lock. */
export async function admitCopyrightEmailWithConcurrentRecommendation(
  noticeId: string,
  admissionInput: Parameters<typeof admitCopyrightEmailCorrespondence>[0],
) {
  return runPoolObservationExclusively(async () => {
    const noticeHeld = Promise.withResolvers<void>()
    const admissionAtNotice = Promise.withResolvers<void>()
    const restorations = new Map<pg.PoolClient, () => void>()
    let held = false
    let requested = false
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
        if (
          typeof statement !== 'object' ||
          statement === null ||
          !('text' in statement) ||
          typeof statement.text !== 'string' ||
          !('values' in statement) ||
          !Array.isArray(statement.values) ||
          !statement.values.some(value => value === noticeId || value === admissionInput.intakeId)
        )
          return Reflect.apply(original, client, args)
        const pending = Reflect.apply(original, client, args)
        if (statement.text.includes('/* admitCopyrightEmailCorrespondence:lockNotice */')) {
          requested = true
          admissionAtNotice.resolve()
        }
        if (
          !held &&
          statement.text.includes('/* appendCopyrightEmailIntakeRecommendation:lockNotice */')
        ) {
          held = true
          return Promise.resolve(pending).then(async result => {
            noticeHeld.resolve()
            await admissionAtNotice.promise
            return result
          })
        }
        return pending
      }) as pg.PoolClient['query']
      Object.defineProperty(client, 'query', { configurable: true, writable: true, value: query })
    }
    writePool.on('acquire', observe)
    const recommendation = appendCopyrightEmailIntakeRecommendation({
      intakeId: admissionInput.intakeId,
      inputSha256: Buffer.alloc(32, 6),
      promptVersion: 'test-concurrent-admission-v1',
      model: 'test-model',
      structuredOutput: { summary: 'Agent output concurrent with staff admission.' },
    })
    void recommendation.then(
      () => {
        if (!held) noticeHeld.reject(new Error('Recommendation never locked the notice'))
      },
      err => noticeHeld.reject(err),
    )
    let admission: ReturnType<typeof admitCopyrightEmailCorrespondence> | undefined
    try {
      await noticeHeld.promise
      admission = admitCopyrightEmailCorrespondence(admissionInput)
      void admission.then(
        () => {
          if (!requested)
            admissionAtNotice.reject(new Error('Admission never requested the notice lock'))
        },
        err => admissionAtNotice.reject(err),
      )
      const [result, stored] = await Promise.all([admission, recommendation])
      return { admission: result, recommendationStored: stored }
    } finally {
      admissionAtNotice.resolve()
      await Promise.allSettled([admission, recommendation])
      writePool.off('acquire', observe)
      for (const restore of restorations.values()) restore()
    }
  })
}
