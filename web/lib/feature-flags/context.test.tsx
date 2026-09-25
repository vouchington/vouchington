import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearAllFeatureFlagOverrides,
  removeFeatureFlagOverride,
  setFeatureFlagOverride,
} from './cookies'
import { FeatureFlagsProvider } from './context'
import { useFeatureFlags } from './use-feature-flags'

function FlagProbe({ name }: { name: string }) {
  const flags = useFeatureFlags()
  return <div data-testid={name}>{String(flags[name] === true)}</div>
}

describe('FeatureFlagsProvider', () => {
  afterEach(() => {
    clearAllFeatureFlagOverrides()
  })

  it('exposes server-provided feature flags to client chrome', () => {
    render(
      <FeatureFlagsProvider globalFlags={{ fediverse: true }}>
        <FlagProbe name='fediverse' />
      </FeatureFlagsProvider>,
    )

    expect(screen.getByTestId('fediverse')).toHaveTextContent('true')
  })

  it('refreshes client chrome when feature-flag overrides change', () => {
    render(
      <FeatureFlagsProvider globalFlags={{ fediverse: false }}>
        <FlagProbe name='fediverse' />
      </FeatureFlagsProvider>,
    )

    expect(screen.getByTestId('fediverse')).toHaveTextContent('false')

    act(() => {
      setFeatureFlagOverride('fediverse', true)
      window.dispatchEvent(new Event('feature-flag-overrides-updated'))
    })

    expect(screen.getByTestId('fediverse')).toHaveTextContent('true')
  })

  it('restores global feature flags when local overrides are cleared', () => {
    setFeatureFlagOverride('fediverse', true)

    render(
      <FeatureFlagsProvider globalFlags={{ fediverse: false }}>
        <FlagProbe name='fediverse' />
      </FeatureFlagsProvider>,
    )

    expect(screen.getByTestId('fediverse')).toHaveTextContent('true')

    act(() => {
      clearAllFeatureFlagOverrides()
      window.dispatchEvent(new Event('feature-flag-overrides-updated'))
    })

    expect(screen.getByTestId('fediverse')).toHaveTextContent('false')
  })

  it('restores individually cleared overrides to global feature flags', () => {
    setFeatureFlagOverride('fediverse', true)
    setFeatureFlagOverride('chat', true)

    render(
      <FeatureFlagsProvider globalFlags={{ fediverse: false, chat: false }}>
        <FlagProbe name='fediverse' />
        <FlagProbe name='chat' />
      </FeatureFlagsProvider>,
    )

    expect(screen.getByTestId('fediverse')).toHaveTextContent('true')
    expect(screen.getByTestId('chat')).toHaveTextContent('true')

    act(() => {
      removeFeatureFlagOverride('fediverse')
      window.dispatchEvent(new Event('feature-flag-overrides-updated'))
    })

    expect(screen.getByTestId('fediverse')).toHaveTextContent('false')
    expect(screen.getByTestId('chat')).toHaveTextContent('true')
  })
})
