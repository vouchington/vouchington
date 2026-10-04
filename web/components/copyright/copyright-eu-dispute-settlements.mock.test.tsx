import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listCopyrightEuDisputeSettlements } from '@/lib/api/client/copyright-eu-dispute-settlements'
import {
  makeCopyrightEuDisputeSettlement,
  makeCopyrightEuDisputeSettlementsPage,
} from '@/test-helpers/api-responses/copyright-eu'
import type { CopyrightEuDisputeSettlementsPage } from '@/types/copyright-eu'
import { CopyrightEuDisputeSettlements } from './copyright-eu-dispute-settlements'

vi.mock(import('@/lib/api/client/copyright-eu-dispute-settlements'), () => ({
  listCopyrightEuDisputeSettlements: vi.fn<typeof listCopyrightEuDisputeSettlements>(),
}))
const list = vi.mocked(listCopyrightEuDisputeSettlements)
const noticeId = '019f0000-0000-7000-8000-000000000001'
const first = makeCopyrightEuDisputeSettlement()
const second = makeCopyrightEuDisputeSettlement({
  id: '019f0000-0000-7000-8000-000000000102',
  body_name: 'Second dispute body',
})
describe('CopyrightEuDisputeSettlements continuation', () => {
  afterEach(() => vi.resetAllMocks())

  it('loads the next cursor page and deduplicates overlapping records', async () => {
    list.mockResolvedValue(makeCopyrightEuDisputeSettlementsPage([first, second]))
    render(
      <CopyrightEuDisputeSettlements
        noticeId={noticeId}
        data={makeCopyrightEuDisputeSettlementsPage([first], 'case-cursor')}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    await screen.findByText('Second dispute body')
    expect(list).toHaveBeenCalledWith(noticeId, { after: 'case-cursor' })
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('keeps loaded records on failure and retries the same cursor', async () => {
    list
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce(makeCopyrightEuDisputeSettlementsPage([second]))
    render(
      <CopyrightEuDisputeSettlements
        noticeId={noticeId}
        data={makeCopyrightEuDisputeSettlementsPage([first], 'retry-cursor')}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    await screen.findByRole('alert')
    expect(screen.getByText('Independent dispute body')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())
    fireEvent.click(screen.getByRole('button'))
    await screen.findByText('Second dispute body')
    expect(list).toHaveBeenNthCalledWith(1, noticeId, { after: 'retry-cursor' })
    expect(list).toHaveBeenNthCalledWith(2, noticeId, { after: 'retry-cursor' })
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('blocks overlapping requests and discards a response from the previous case', async () => {
    const pending = Promise.withResolvers<CopyrightEuDisputeSettlementsPage>()
    list.mockReturnValue(pending.promise)
    const { rerender } = render(
      <CopyrightEuDisputeSettlements
        noticeId={noticeId}
        data={makeCopyrightEuDisputeSettlementsPage([first], 'pending-cursor')}
      />,
    )
    const button = screen.getByRole('button')
    fireEvent.click(button)
    fireEvent.click(button)
    expect(list).toHaveBeenCalledOnce()
    expect(button).toBeDisabled()
    const other = makeCopyrightEuDisputeSettlement({ body_name: 'Another case body' })
    rerender(
      <CopyrightEuDisputeSettlements
        noticeId='019f0000-0000-7000-8000-000000000002'
        data={makeCopyrightEuDisputeSettlementsPage([other])}
      />,
    )
    await act(async () => {
      pending.resolve(makeCopyrightEuDisputeSettlementsPage([second]))
      await pending.promise
    })
    expect(screen.getByText('Another case body')).toBeInTheDocument()
    expect(screen.queryByText('Second dispute body')).not.toBeInTheDocument()
    expect(screen.queryByText('Independent dispute body')).not.toBeInTheDocument()
  })
})
