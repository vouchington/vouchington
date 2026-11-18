import onError from '@modules/on-error'

export function enqueueAppealResolutionAsync(appealId: string, runId: string): void {
  import('@queues/ai-agents/enqueues/appeal-resolution')
    .then(({ enqueueAppealResolution }) => {
      enqueueAppealResolution(appealId, runId)
    })
    .catch(onError)
}
