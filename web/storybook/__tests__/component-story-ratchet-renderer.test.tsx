// @vitest-environment jsdom

import { lazy } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { componentStoryRatchetParameters } from '../component-story-ratchet-parameters'
import { ComponentStoryRatchetGrid } from '../component-story-ratchet-renderer'

describe('ComponentStoryRatchetGrid', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enforces a11y checks for stable generated stories', () => {
    function ReadyComponent() {
      return <span>Ready component</span>
    }

    render(
      <ComponentStoryRatchetGrid
        title='Ratchet test'
        components={[{ key: 'ready.tsx#ReadyComponent', component: ReadyComponent }]}
      />,
    )

    expect(componentStoryRatchetParameters).toEqual({ a11y: { test: 'error' } })
    expect(screen.getByRole('heading', { name: 'Ratchet test' })).toBeTruthy()
    expect(screen.getByText('ready.tsx#ReadyComponent')).toBeTruthy()
    expect(screen.getByText('Ready component')).toBeTruthy()
  })

  it('forwards fixture props to components that require consumer context', () => {
    function RequiredPropsComponent({ label }: { label: string }) {
      return <span>{label}</span>
    }

    render(
      <ComponentStoryRatchetGrid
        title='Fixture props test'
        components={[
          {
            key: 'required-props.tsx#RequiredPropsComponent',
            component: RequiredPropsComponent,
            props: { label: 'Fixture-backed component' },
          },
        ]}
      />,
    )

    expect(screen.getByText('Fixture-backed component')).toBeTruthy()
  })

  it('shows a visible fallback when a legacy component cannot render without fixtures', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    function ThrowingComponent() {
      throw new Error('missing fixture')
    }

    render(
      <ComponentStoryRatchetGrid
        title='Ratchet test'
        components={[{ key: 'throwing.tsx#ThrowingComponent', component: ThrowingComponent }]}
      />,
    )

    expect(console.error).toHaveBeenCalled()
    expect(screen.getByText('throwing.tsx#ThrowingComponent')).toBeTruthy()
    expect(screen.getByText('Rendered fallback state')).toBeTruthy()
    expect(screen.getByText('missing fixture')).toBeTruthy()
    expect(screen.getByText('missing fixture').className).not.toContain('text-muted-foreground/70')
  })

  it('shows the component key while a ratcheted component is suspended', () => {
    const SuspendedComponent = lazy(() => new Promise(() => {}))

    render(
      <ComponentStoryRatchetGrid
        title='Ratchet test'
        components={[{ key: 'suspended.tsx#SuspendedComponent', component: SuspendedComponent }]}
      />,
    )

    expect(screen.getByText('suspended.tsx#SuspendedComponent')).toBeTruthy()
  })
})
