import { upsertScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { SCHEDULED_JOB_MANIFESTS } from '@services/queue-monitoring/scheduled-job-manifests'
import { Queue } from 'glide-mq'
import { afterAll, describe, expect, it } from 'vitest'

// glide-mq validates scheduler templates in `upsertJobScheduler` and rejects options the scheduler
// tick never applies (delay, deduplication, parent, jobId). The other registration tests stub the
// upsert, so this one registers every real manifest on a real (test-mode) queue.
describe('scheduled job template validation', () => {
  const queues: Queue[] = []

  afterAll(async () => {
    await Promise.all(queues.map(queue => queue.obliterate({ force: true })))
  })

  it.each(SCHEDULED_JOB_MANIFESTS.map(manifest => [manifest.queueName, manifest] as const))(
    'registers every %s template with glide-mq',
    async (queueName, manifest) => {
      const queue = new Queue(`template-validation:${queueName}`, {})
      queues.push(queue)

      await upsertScheduledJobManifest(queue, manifest, { nodeEnv: 'production' })

      const registered = (await queue.getRepeatableJobs()).map(entry => entry.name).toSorted()
      expect(registered).toEqual(manifest.jobs.map(job => job.schedulerId).toSorted())
    },
  )
})
