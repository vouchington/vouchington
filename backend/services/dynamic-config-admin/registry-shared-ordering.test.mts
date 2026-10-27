import { describe, expect, it } from 'vitest'
import type { DynamicConfigLike } from '@vouchington/dynamic-config'
import {
  BACKGROUND_ORDERING_CAPS,
  getBackgroundOrderingLimits,
} from '@queues/background/enqueues/ordering-caps'
import {
  BACKGROUNDCPU_ORDERING_CAPS,
  getBackgroundCpuOrderingLimits,
} from '@queues/background-cpu/enqueues/ordering-caps'
import { orderingConfigFields } from '@data-stores/valkey-glide-mq/shared-queue-ordering'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'
import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'

describe('shared queue DynamicConfig admin fields', () => {
  it('bounds singleton lanes and keeps lane defaults', () => {
    const fields = new Map<string, string | number | boolean>([['bluesky_follow_propagation', 2]])
    const limits = getBackgroundOrderingLimits('bluesky-follow-propagation')
    expect(
      getBoundedPositiveIntegerField({ fields }, 'bluesky_follow_propagation', {
        defaultValue: limits.defaultValue,
        maxValue: limits.maxValue,
      }),
    ).toBe(1)
    expect(getBackgroundCpuOrderingLimits('ai-spend-cap').maxValue).toBe(1)
    for (const type of ['topics', 'posts', 'rss_feed_items', 'crawl_chunks', 'images']) {
      expect(getBackgroundCpuOrderingLimits(`bedrock-embeddings:creation:${type}`)).toMatchObject({
        defaultValue: 1,
        maxValue: 1,
      })
    }
    expect(getBackgroundCpuOrderingLimits('crawl:boilerplate').defaultValue).toBe(4)
    expect(
      getBackgroundCpuOrderingLimits('crawl:018f7757-2e3e-7cc0-930c-25b612ca562a'),
    ).toMatchObject({ configKey: 'crawl:hostname', defaultValue: 1, maxValue: 1 })
  })

  it.each([
    ['background', BACKGROUND_ORDERING_CAPS],
    ['background-cpu', BACKGROUNDCPU_ORDERING_CAPS],
  ])('registers exactly the bounded %s lane fields without data stores', (queue, caps) => {
    const fields = orderingConfigFields(caps)
    const config: DynamicConfigLike = {
      key: `dynamic-config:${queue}-queue-config`,
      fieldTypes: fields.fieldTypes,
      defaultFields: fields.defaultFields,
      waitForInitialization: async () => {},
      getFields: () => fields.defaultFields,
      setFields: async () => {},
    }
    const entry = defineBoundedWorkNamespace({
      namespace: `${queue}-queue-config`,
      config,
      label: queue,
      maxValues: fields.maxValues,
      descriptions: fields.descriptions,
    })
    expect(Object.keys(entry.fields).toSorted()).toEqual(
      Object.keys(fields.defaultFields).toSorted(),
    )
    expect(
      entry.fields['ordering_bluesky_follow_propagation']?.maxValue ??
        entry.fields['ordering_ai_spend_cap']?.maxValue,
    ).toBe(1)
  })
})
