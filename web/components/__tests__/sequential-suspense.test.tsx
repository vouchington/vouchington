import { use } from 'react'
import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { SequentialSuspense } from '../sequential-suspense'

describe('SequentialSuspense', () => {
  it('returns null for empty children', () => {
    const { container } = render(<SequentialSuspense>{[]}</SequentialSuspense>)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders synchronous children in order', () => {
    const { container } = render(
      <SequentialSuspense>
        <div>First</div>
        <div>Second</div>
      </SequentialSuspense>,
    )
    expect(container).toHaveTextContent('FirstSecond')
  })

  it('renders a single child after it resolves without a fallback', async () => {
    const { promise, resolve } = Promise.withResolvers<void>()
    function PendingChild() {
      use(promise)
      return <div>Only child</div>
    }

    const { container } = await act(async () =>
      render(
        <SequentialSuspense>
          <PendingChild />
        </SequentialSuspense>,
      ),
    )
    expect(container).toBeEmptyDOMElement()

    await act(async () => {
      resolve()
      await promise
    })

    expect(screen.getByText('Only child')).toBeInTheDocument()
  })

  it('filters out falsy children', () => {
    const showHidden = false as boolean
    render(
      <SequentialSuspense>
        <div>Visible</div>
        {showHidden && <div>Hidden</div>}
      </SequentialSuspense>,
    )
    expect(screen.getByText('Visible')).toBeInTheDocument()
    expect(screen.queryByText('Hidden')).toBeNull()
  })

  it('shows a custom fallback while the first child is pending', async () => {
    const { promise, resolve } = Promise.withResolvers<void>()
    function PendingChild() {
      use(promise)
      return <div>Content</div>
    }

    await act(async () =>
      render(
        <SequentialSuspense fallback={<div>Loading…</div>}>
          <PendingChild />
        </SequentialSuspense>,
      ),
    )
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('Content')).toBeNull()

    await act(async () => {
      resolve()
      await promise
    })

    expect(screen.getByText('Content')).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).toBeNull()
  })
})
