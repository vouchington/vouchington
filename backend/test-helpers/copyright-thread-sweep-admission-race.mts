import type pg from 'pg'
import { writePool } from '@data-stores/psql'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'
import { admitCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-admission.mts'

/** Start a real reviewer after sweep activity proof, then finish its submission before blocker proof. */
export async function admitCopyrightEmailDuringThreadProof<Result>(
  input: Parameters<typeof admitCopyrightEmailCorrespondence>[0],
  noticeId: string,
  sweep: () => Promise<Result>,
) {
  return runPoolObservationExclusively(async () => {
    const submissionWritten = Promise.withResolvers<void>()
    void submissionWritten.promise.catch(() => {})
    let admission: ReturnType<typeof admitCopyrightEmailCorrespondence> | undefined
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
        if (
          typeof statement !== 'object' ||
          statement === null ||
          !('text' in statement) ||
          typeof statement.text !== 'string' ||
          !('values' in statement) ||
          !Array.isArray(statement.values) ||
          !statement.values.includes(noticeId)
        )
          return Reflect.apply(original, client, args)
        if (!admission && statement.text.includes('/* readCopyrightThreadBlockerGeneration */')) {
          admission = admitCopyrightEmailCorrespondence(input)
          void admission.then(
            () =>
              submissionWritten.reject(new Error('Reviewer did not write its owned submission')),
            (err: unknown) => submissionWritten.reject(err),
          )
          return submissionWritten.promise.then(() => Reflect.apply(original, client, args))
        }
        const pending = Reflect.apply(original, client, args)
        if (statement.text.includes('/* admitCopyrightEmailCorrespondence:submission */'))
          return Promise.resolve(pending).then(result => {
            submissionWritten.resolve()
            return result
          })
        return pending
      }) as pg.PoolClient['query']
      Object.defineProperty(client, 'query', { configurable: true, writable: true, value: query })
    }
    writePool.on('acquire', observe)
    try {
      const sweepResult = await sweep()
      if (!admission) throw new Error('Owned sweep did not reach blocker proof')
      return { sweep: sweepResult, admission: await admission }
    } finally {
      await Promise.allSettled([admission])
      writePool.off('acquire', observe)
      for (const restore of restorations.values()) restore()
    }
  })
}

/** Commit a real hold after paged proof finishes but before the final eligibility statement. */
export async function holdCopyrightCaseBeforeThreadEligibility<Result>(
  noticeId: string,
  placeHold: () => Promise<unknown>,
  sweep: () => Promise<Result>,
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
        if (
          placed ||
          typeof statement !== 'object' ||
          statement === null ||
          !('text' in statement) ||
          typeof statement.text !== 'string' ||
          !statement.text.includes('/* recheckCopyrightThreadCaseEligibility */') ||
          !('values' in statement) ||
          !Array.isArray(statement.values) ||
          !statement.values.includes(noticeId)
        )
          return Reflect.apply(original, client, args)
        placed = true
        return placeHold().then(() => Reflect.apply(original, client, args))
      }) as pg.PoolClient['query']
      Object.defineProperty(client, 'query', { configurable: true, writable: true, value: query })
    }
    writePool.on('acquire', observe)
    try {
      const result = await sweep()
      if (!placed) throw new Error('Owned sweep did not finish its paged retention proof')
      return result
    } finally {
      writePool.off('acquire', observe)
      for (const restore of restorations.values()) restore()
    }
  })
}
