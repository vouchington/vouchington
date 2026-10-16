import { describe, expect, it } from 'vitest'
import { adminRouteOutputSchema } from './output-schema.mts'
import { adminQueueTools } from './site-operations-queues.mts'

const tool = (name: string) => adminQueueTools.find(candidate => candidate.schema.name === name)!

describe('admin queue tools route selection', () => {
  it('charges list_queues to the queue list, or to the domain list when domains_of is given', () => {
    const { meta } = tool('list_queues')
    const queues = { method: 'GET', path: '/api/v1/mq/queues' } as const
    const domains = { method: 'GET', path: '/api/v1/mq/queues/:name/domains' } as const

    expect(meta?.api).toEqual([queues, domains])
    expect(meta?.selectApi?.({})).toEqual([queues])
    expect(meta?.selectApi?.({ domains_of: 'background' })).toEqual([domains])
    expect(meta?.selectOutputSchema?.({})).toEqual(adminRouteOutputSchema(queues))
    expect(meta?.selectOutputSchema?.({ domains_of: 'background' })).toEqual(
      adminRouteOutputSchema(domains),
    )
  })

  it.each(['pause', 'resume'])(
    'charges %s_queue to the whole-queue route, or to the domain route when domain is given',
    action => {
      const { meta } = tool(`${action}_queue`)
      const queue = { method: 'POST', path: `/api/v1/mq/queues/:name/${action}` }
      const domain = { method: 'POST', path: `/api/v1/mq/queues/:name/domains/:domain/${action}` }

      expect(meta?.api).toEqual([queue, domain])
      expect(meta?.selectApi?.({ name: 'psql' })).toEqual([queue])
      expect(meta?.selectApi?.({ name: 'background', domain: 'ses-inbound' })).toEqual([domain])
    },
  )

  it('charges retry_failed_queue_jobs to the whole-queue route, or to the domain route when domain is given', () => {
    const { meta } = tool('retry_failed_queue_jobs')
    const queue = { method: 'POST', path: '/api/v1/mq/queues/:name/retry-failed' }
    const domain = { method: 'POST', path: '/api/v1/mq/queues/:name/domains/:domain/retry-failed' }

    expect(meta?.api).toEqual([queue, domain])
    expect(meta?.selectApi?.({ name: 'psql' })).toEqual([queue])
    expect(meta?.selectApi?.({ name: 'background', domain: 'ses-inbound' })).toEqual([domain])
  })
})
