import { describe, expect, it } from 'vitest'
import {
  SSR_LOCALIZATION_REVISION_ATTRIBUTE,
  ssrLocalizationRevisionProps,
} from '../ssr-localization-revision-props'

describe('ssrLocalizationRevisionProps', () => {
  it('omits the marker outside development', () => {
    expect(ssrLocalizationRevisionProps('production', 'rev-1')).toEqual({})
    expect(ssrLocalizationRevisionProps('test', 'rev-1')).toEqual({})
    expect(ssrLocalizationRevisionProps(undefined, 'rev-1')).toEqual({})
  })

  it('omits the marker when development has no revision', () => {
    expect(ssrLocalizationRevisionProps('development', undefined)).toEqual({})
    expect(ssrLocalizationRevisionProps('development', '')).toEqual({})
  })

  it('emits the HTML data attribute in development', () => {
    expect(ssrLocalizationRevisionProps('development', 'rev-1')).toEqual({
      [SSR_LOCALIZATION_REVISION_ATTRIBUTE]: 'rev-1',
    })
  })
})
