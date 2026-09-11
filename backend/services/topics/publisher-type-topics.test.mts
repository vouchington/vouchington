import { expect, it, describe } from 'vitest'
import { PUBLISHER_TYPE_SLUGS } from './publisher-type-topics.mts'
import { PUBLISHER_TYPE_SLUGS as SHARED_PUBLISHER_TYPE_SLUGS } from '@ts-shared/utils/publisher-types'

describe('publisher-type-topics', () => {
  it('keeps backend publisher type slugs aligned with the shared web/backend list', () => {
    expect(PUBLISHER_TYPE_SLUGS).toEqual([...SHARED_PUBLISHER_TYPE_SLUGS])
  })
})
