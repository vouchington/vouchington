import onError from '@modules/on-error'

export function enqueueAppealResolutionAsync(appealId: string): void {
  import('@queues/ai-agents/enqueues/appeal-resolution')
    .then(({ enqueueAppealResolution }) => {
      enqueueAppealResolution(appealId)
    })
    .catch(onError)
}
