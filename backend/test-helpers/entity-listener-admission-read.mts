import { TestQueue, TestWorker } from 'glide-mq/testing'
import {
  onEnqueueAdmission,
  type EnqueueAdmission,
} from '../data-stores/valkey-glide-mq/glide-mq-admission.mts'
import {
  getSharedBackgroundWorker,
  holdBackgroundDomain,
} from '../../test-helpers/shared-background-worker.mts'
import { ENTITY_LISTENERS_DOMAIN } from '../queues/background/enqueues/entity-listeners-jobs.mts'
import { entitiesListeners as queue } from '../queues/entity-listeners/queues.mts'
import {
  entityListenerInputId,
  entityListenerJobName,
  isEntityListenerAdmission,
  rejectEntityListenerReason,
} from './entity-listener-admissions.mts'
import { withEntityListenerCompletion } from './entity-listener-completion.mts'

let held = false

/** Finish a writer read while dispatch of this fresh entity's testing job is held. */
export function withEntityListenerAdmissionRead<T>(
  target: { jobName: string; entityId: string },
  action: () => Promise<T>,
  read: () => Promise<void>,
): Promise<T> {
  const configuredQueue: unknown = queue
  const configuredWorker: unknown = getSharedBackgroundWorker()
  const jobName = entityListenerJobName(target.jobName)
  if (!(configuredQueue instanceof TestQueue) || !(configuredWorker instanceof TestWorker))
    return Promise.reject(
      new Error('Admission ordering requires the normal fork-owned testing provider'),
    )
  if (held)
    return Promise.reject(new Error('The entity-listeners domain is already held by another owner'))
  let ownsHold = false
  let releaseDomain: () => Promise<void> = () => Promise.resolve()
  const resume = () => {
    return ownsHold ? releaseDomain() : Promise.resolve()
  }
  const added = Promise.withResolvers<{ id: string; name: string; data: unknown }>()
  const admitted = Promise.withResolvers<EnqueueAdmission>()
  const matchingJobs: { id: string; name: string; data: unknown }[] = []
  const matchingAdmissions: EnqueueAdmission[] = []
  const onAdded = (job: { id: string; name: string; data: unknown }) => {
    if (job.name !== jobName || entityListenerInputId(job.data) !== target.entityId) return
    matchingJobs.push(job)
    added.resolve(job)
  }
  let off = () => {}
  // The generic owner registers onTestFinished before this action has any effects.
  return withEntityListenerCompletion(
    [target],
    async () => {
      if (held) throw new Error('Entity worker ownership changed before action')
      held = true
      ownsHold = true
      // Gates only entity-listeners handlers: the shared queue's other domains keep running, so a
      // producer that awaits one of their jobs before enqueuing ours does not stall. A gate does not
      // stop work already started; the caller must finish this fresh entity's prior owned job first.
      releaseDomain = holdBackgroundDomain(ENTITY_LISTENERS_DOMAIN.domain)
      configuredQueue.on('added', onAdded)
      off = onEnqueueAdmission(event => {
        if (
          isEntityListenerAdmission(event) &&
          event.jobName === jobName &&
          event.inputs.some(input => entityListenerInputId(input) === target.entityId)
        ) {
          matchingAdmissions.push(event)
          admitted.resolve(event)
        }
        return undefined
      })
      const mutation = Promise.resolve().then(action)
      const settled = Promise.allSettled([mutation])
      let failed = false
      let primary: unknown
      let mutationFailureConsumed = false
      let ports: [{ id: string; name: string; data: unknown }, EnqueueAdmission] | undefined
      try {
        const first = await Promise.race([
          Promise.all([added.promise, admitted.promise]).then(value => ({
            kind: 'admission' as const,
            value,
          })),
          settled.then(([result]) => ({ kind: 'mutation' as const, result: result! })),
        ])
        if (first.kind === 'mutation') {
          if (first.result.status === 'rejected') {
            failed = true
            primary = first.result.reason
            mutationFailureConsumed = true
          } else throw new Error('Mutation settled without its owned added/admission ports')
        } else {
          ports = first.value
          // Both real ports fired, but outer addAndFlush remains pending. Do not await it here.
          await read()
        }
      } catch (err) {
        failed = true
        primary = err
      } finally {
        await resume() // Release BEFORE awaiting mutation or original factory completion.
      }
      const [outcome] = await settled
      const secondary: unknown[] = []
      if (outcome!.status === 'rejected' && !mutationFailureConsumed) {
        if (failed) secondary.push(outcome!.reason)
        else {
          failed = true
          primary = outcome!.reason
        }
      }
      if (ports) {
        const [receipt] = await Promise.allSettled([ports[1].completion])
        if (receipt!.status === 'fulfilled') {
          const job = receipt!.value
          if (
            matchingJobs.length !== 1 ||
            matchingAdmissions.length !== 1 ||
            !job ||
            typeof job !== 'object' ||
            !('id' in job) ||
            job.id !== ports[0].id
          )
            secondary.push(new Error('Added job and original factory receipt identities differ'))
        }
        // The generic admission owner retains/reports raw rejection and drains every physical receipt.
      }
      if (secondary.length)
        return Promise.reject(
          new AggregateError(secondary, 'Admission read action failed', {
            cause: failed ? primary : secondary[0],
          }),
        )
      if (failed) return rejectEntityListenerReason<T>(primary)
      if (outcome!.status !== 'fulfilled') throw new Error('Mutation did not fulfill')
      return outcome!.value
    },
    {
      release: resume,
      restore: () => {
        const errors: unknown[] = []
        try {
          configuredQueue.off('added', onAdded)
        } catch (err) {
          errors.push(err)
        }
        try {
          off()
        } catch (err) {
          errors.push(err)
        }
        if (ownsHold) held = false
        if (errors.length === 1) return rejectEntityListenerReason(errors[0])
        if (errors.length)
          return Promise.reject(
            new AggregateError(errors, 'Admission read cleanup failed', { cause: errors[0] }),
          )
        return undefined
      },
    },
  )
}
