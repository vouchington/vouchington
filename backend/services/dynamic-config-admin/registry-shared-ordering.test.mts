import { describe, expect, it } from 'vitest'
import type { DynamicConfigLike } from '@vouchington/dynamic-config'
import { BACKGROUND_ORDERING_CAPS } from '../../queues/background/ordering-caps.mts'
import { BACKGROUNDCPU_ORDERING_CAPS } from '../../queues/background-cpu/ordering-caps.mts'
import { orderingConfigFields } from '../../queues/shared-ordering.mts'
import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'

describe('shared queue DynamicConfig admin fields', () => {
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
