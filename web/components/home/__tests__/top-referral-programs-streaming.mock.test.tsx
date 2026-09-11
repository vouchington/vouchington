import { Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TopReferralProgramsStreaming } from '../top-referral-programs-streaming'
import type { TopReferralProgramsViewModel } from '@/lib/view-models/homepage-view-models'

vi.mock(import('../top-referral-programs'), () => ({
  TopReferralPrograms: ({ data }: { data: TopReferralProgramsViewModel | null }) => (
    <div data-testid='top-referral-programs'>{data?.length ?? 0}</div>
  ),
}))

describe('TopReferralProgramsStreaming', () => {
  it('unwraps the data promise and renders TopReferralPrograms', async () => {
    const resolvedData: TopReferralProgramsViewModel = [
      { id: 't-1', name: 'Chase Sapphire', href: '/referral-programs/chase-sapphire' },
    ]
    const dataPromise = Promise.resolve(resolvedData)

    await act(async () => {
      render(
        <Suspense fallback={<div>Loading</div>}>
          <TopReferralProgramsStreaming dataPromise={dataPromise} />
        </Suspense>,
      )
      await dataPromise
    })

    expect(screen.getByTestId('top-referral-programs')).toHaveTextContent('1')
  })
})
