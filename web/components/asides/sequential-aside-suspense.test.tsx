import { use } from 'react'
import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { SequentialAsideSuspense } from './sequential-aside-suspense'

describe('SequentialAsideSuspense', () => {
  it('shows an aside skeleton until the first aside resolves', async () => {
    const { promise, resolve } = Promise.withResolvers<void>()
    function PendingAside() {
      use(promise)
      return <div>Resolved aside</div>
    }

    const { container } = await act(async () =>
      render(
        <SequentialAsideSuspense>
          <PendingAside />
        </SequentialAsideSuspense>,
      ),
    )

    expect(container.querySelector('[data-pw="skeleton"]')).not.toBeNull()
    expect(screen.queryByText('Resolved aside')).toBeNull()

    await act(async () => {
      resolve()
      await promise
    })

    expect(screen.getByText('Resolved aside')).toBeInTheDocument()
    expect(container.querySelector('[data-pw="skeleton"]')).toBeNull()
  })
})
