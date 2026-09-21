import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  resolveCopyrightNoticeTargets,
  type CopyrightNoticeResolvedTarget,
} from '@/lib/api/client/copyright-notice-targets'
import { CopyrightNoticeTargetPicker } from './copyright-notice-target-picker'

vi.mock(import('@/lib/api/client/copyright-notice-targets'), () => ({
  resolveCopyrightNoticeTargets: vi.fn<typeof resolveCopyrightNoticeTargets>(),
}))

const mockResolveTargets = vi.mocked(resolveCopyrightNoticeTargets)

describe('CopyrightNoticeTargetPicker', () => {
  it('discards a response for a URL that has since changed', async () => {
    const first = deferred<Awaited<ReturnType<typeof resolveCopyrightNoticeTargets>>>()
    const second = deferred<Awaited<ReturnType<typeof resolveCopyrightNoticeTargets>>>()
    mockResolveTargets.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const onChange = vi.fn<(targets: CopyrightNoticeResolvedTarget[]) => void>()
    render(
      <CopyrightNoticeTargetPicker
        targets={[]}
        onChange={onChange}
      />,
    )

    const input = screen.getByLabelText('Hosted use URL')
    fireEvent.change(input, { target: { value: 'https://voucha.ai/discussion/first' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find hosted material' }))
    fireEvent.change(input, { target: { value: 'https://voucha.ai/discussion/second' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find hosted material' }))

    second.resolve([makeTarget('second')])
    expect(await screen.findByLabelText('Hosted image 1: second')).toBeInTheDocument()
    expect(screen.getByLabelText('Hosted image 1: second')).not.toBeChecked()
    first.resolve([makeTarget('first')])
    await waitFor(() => expect(mockResolveTargets).toHaveBeenCalledTimes(2))
    expect(screen.queryByLabelText('Hosted image 1: first')).not.toBeInTheDocument()
  })

  it('clears resolved images when lookup fails', async () => {
    mockResolveTargets.mockRejectedValue(new Error('not found'))
    const onChange = vi.fn<(targets: CopyrightNoticeResolvedTarget[]) => void>()
    render(
      <CopyrightNoticeTargetPicker
        targets={[]}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Hosted use URL'), {
      target: { value: 'https://voucha.ai/discussion/missing' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find hosted material' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]))
  })

  it('does not select more than twenty hosted images', async () => {
    const many = Array.from({ length: 21 }, (_, index) => ({
      post_id: '019f0000-0000-7000-8000-000000000001',
      image_id: `019f0000-0000-7000-8000-0000000000${String(index + 10)}`,
      target_url: 'https://voucha.ai/discussion/hosted-material',
      order_index: index,
      caption: `Image ${index + 1}`,
    }))
    mockResolveTargets.mockResolvedValue(many)
    const onChange = vi.fn<(targets: CopyrightNoticeResolvedTarget[]) => void>()
    const { rerender } = render(
      <CopyrightNoticeTargetPicker
        targets={many.slice(0, 20)}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Hosted use URL'), {
      target: { value: 'https://voucha.ai/discussion/hosted-material' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find hosted material' }))
    expect(await screen.findByLabelText('Hosted image 21: Image 21')).toBeInTheDocument()
    rerender(
      <CopyrightNoticeTargetPicker
        targets={many.slice(0, 20)}
        onChange={onChange}
      />,
    )
    onChange.mockClear()
    fireEvent.click(screen.getByLabelText('Hosted image 21: Image 21'))
    expect(onChange).not.toHaveBeenCalled()
  })
})

function makeTarget(caption: string) {
  return {
    post_id: '019f0000-0000-7000-8000-000000000001',
    image_id: `019f0000-0000-7000-8000-00000000000${caption === 'first' ? '2' : '3'}`,
    target_url: `https://voucha.ai/discussion/${caption}`,
    order_index: 0,
    caption,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => {
    resolve = next
  })
  return { promise, resolve }
}
