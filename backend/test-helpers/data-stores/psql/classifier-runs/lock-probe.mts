import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  ClassifierRunAdapter,
  ClassifierRunSubject,
} from '../../../../services/classifier-runs/index.mts'

const LOCK_NOT_AVAILABLE = '55P03'

/**
 * Whether another connection can take the subject's lock right now. It asks the adapter's own
 * `lockCurrent` from a separate transaction with a short lock timeout, so it probes exactly the row
 * and advisory locks that classifier takes, whatever they are.
 */
export async function probeClassifierSubjectLock<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  subject: ClassifierRunSubject,
): Promise<'free' | 'held'> {
  await using probe = await beginTransaction()
  await probe(sql`/* probeClassifierSubjectLock */ SET LOCAL lock_timeout = '300ms'`)
  try {
    await adapter.lockCurrent(probe, subject)
    return 'free'
  } catch (error) {
    if ((error as { code?: string }).code === LOCK_NOT_AVAILABLE) return 'held'
    throw error
  }
}

/** Probes the subject's lock while another transaction holds it, as the control for the probe. */
export async function probeClassifierSubjectLockWhileHeld<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  subject: ClassifierRunSubject,
): Promise<'free' | 'held'> {
  await using holder = await beginTransaction()
  await adapter.lockCurrent(holder, subject)
  // Awaited so the holder is still open while the probe waits on its lock.
  return await probeClassifierSubjectLock(adapter, subject)
}

/**
 * The adapter with every candidate search (topics or stories, whichever it captures) preceded by a
 * lock probe. `observed` collects what each search saw, and `afterCapture` runs once the search
 * returns, to model the subject changing while the search was in flight.
 */
export function observeCandidateCaptureLock<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  observed: Array<'free' | 'held'>,
  afterCapture?: (subject: ClassifierRunSubject) => Promise<void>,
): ClassifierRunAdapter<C, L, E> {
  const { captureCandidates, captureStoryCandidates } = adapter
  if (!captureCandidates && !captureStoryCandidates) {
    throw new Error('observed classifier does not capture candidates')
  }
  const observe = async <T,>(subject: ClassifierRunSubject, search: () => Promise<T>) => {
    observed.push(await probeClassifierSubjectLock(adapter, subject))
    const found = await search()
    await afterCapture?.(subject)
    return found
  }
  const observing: ClassifierRunAdapter<C, L, E> = { ...adapter }
  if (captureCandidates) {
    observing.captureCandidates = (query, subject, current) =>
      observe(subject, () => captureCandidates.call(adapter, query, subject, current))
  }
  if (captureStoryCandidates) {
    observing.captureStoryCandidates = (query, subject, current) =>
      observe(subject, () => captureStoryCandidates.call(adapter, query, subject, current))
  }
  return observing
}
