import onError from '@modules/on-error'

export type EnqueueAdmission = {
  readonly queue: object
  readonly queueName: string
  readonly jobName: string
  readonly inputs: readonly unknown[]
  readonly completion: Promise<unknown>
  readonly observerErrors: readonly unknown[]
  readonly reportingErrors: readonly unknown[]
}

type AdmissionListener = (event: EnqueueAdmission) => undefined
const listeners = new Set<AdmissionListener>()

/** @public Observe actual factory admissions before callers discard their original promises. */
export function onEnqueueAdmission(listener: AdmissionListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Publishing never replaces the original enqueue promise, retry policy or reporting contract. */
export function publishEnqueueAdmission(
  identity: Pick<EnqueueAdmission, 'queue' | 'queueName' | 'jobName' | 'inputs' | 'completion'>,
): void {
  const observerErrors: unknown[] = []
  const reportingErrors: unknown[] = []
  const event: EnqueueAdmission = { ...identity, observerErrors, reportingErrors }
  for (const listener of [...listeners]) {
    try {
      listener(event)
    } catch (err) {
      observerErrors.push(err)
      try {
        onError(
          err instanceof Error
            ? err
            : new Error('Enqueue admission observer failed', { cause: err }),
        )
      } catch (err) {
        reportingErrors.push(err)
      }
    }
  }
}
