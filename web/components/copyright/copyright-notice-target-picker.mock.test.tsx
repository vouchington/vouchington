import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/error'
import {
  resolveCopyrightNoticeTargets,
  type CopyrightNoticeResolvedTarget,
} from '@/lib/api/client/copyright-notice-targets'
import { CopyrightNoticeTargetPicker } from './copyright-notice-target-picker'

configure({ testIdAttribute: 'data-pw' })

vi.mock(import('@/lib/api/client/copyright-notice-targets'), async importOriginal => ({
  ...(await importOriginal()),
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

  it('points to the form, not to email, before and after a lookup', async () => {
    mockResolveTargets.mockRejectedValue(new Error('not found'))
    render(
      <CopyrightNoticeTargetPicker
        targets={[]}
        onChange={vi.fn<(targets: CopyrightNoticeResolvedTarget[]) => void>()}
      />,
    )
    const hint = screen.getByTestId('copyright-designated-agent-hint')
    expect(hint).toHaveTextContent(/use this form to file your notice/i)
    expect(hint).not.toHaveTextContent(/e-?mail/i)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Hosted use URL'), {
      target: { value: 'https://voucha.ai/discussion/missing' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find hosted material' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not find hosted material/i)
    expect(alert).not.toHaveTextContent(/e-?mail/i)
    expect(within(alert).getByRole('link', { name: 'designated agent status' })).toHaveAttribute(
      'href',
      '/copyright/designated-agent',
    )

    fireEvent.change(screen.getByLabelText('Hosted use URL'), {
      target: { value: 'https://voucha.ai/discussion/other' },
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('copyright-designated-agent-hint')).toBeInTheDocument()
  })

  it('shows the same not-found copy whatever the lookup failure was', async () => {
    const copies = new Set<string>()
    for (const failure of [
      new ApiError('Post not found', 404),
      new ApiError('Hosted image placement was not found', 422),
      new Error('This hosted use does not have any available images.'),
    ]) {
      mockResolveTargets.mockRejectedValueOnce(failure)
      const { unmount } = render(
        <CopyrightNoticeTargetPicker
          targets={[]}
          onChange={vi.fn<(targets: CopyrightNoticeResolvedTarget[]) => void>()}
        />,
      )
      fireEvent.change(screen.getByLabelText('Hosted use URL'), {
        target: { value: 'https://voucha.ai/discussion/missing' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Find hosted material' }))
      copies.add((await screen.findByRole('alert')).textContent ?? '')
      unmount()
    }
    expect([...copies]).toHaveLength(1)
  })

  it('does not select more than twenty hosted images', async () => {
    const many: CopyrightNoticeResolvedTarget[] = Array.from({ length: 21 }, (_, index) => ({
      surface: 'post-image',
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
  it('keeps two image slots with the same image ID distinct', async () => {
    const choices: CopyrightNoticeResolvedTarget[] = [
      {
        surface: 'topic-logo-image',
        topic_id: 'topic-1',
        image_id: 'image-1',
        target_url: 'https://voucha.ai/topic/photos',
        order_index: 0,
        caption: 'Topic logo',
      },
      {
        surface: 'topic-hero-image',
        topic_id: 'topic-1',
        image_id: 'image-1',
        target_url: 'https://voucha.ai/topic/photos',
        order_index: 1,
        caption: 'Topic hero image',
      },
    ]
    mockResolveTargets.mockResolvedValue(choices)
    const onChange = vi.fn<(targets: CopyrightNoticeResolvedTarget[]) => void>()
    const { rerender } = render(
      <CopyrightNoticeTargetPicker
        targets={[]}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Hosted use URL'), {
      target: { value: 'https://voucha.ai/topic/photos' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find hosted material' }))
    fireEvent.click(await screen.findByLabelText('Hosted image 1: Topic logo'))
    expect(onChange).toHaveBeenLastCalledWith([choices[0]])
    rerender(
      <CopyrightNoticeTargetPicker
        targets={[choices[0]!]}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByLabelText('Hosted image 2: Topic hero image'))
    expect(onChange).toHaveBeenLastCalledWith(choices)
  })
  it('removes the selected slot without changing another slot that shares its image', async () => {
    const choices: CopyrightNoticeResolvedTarget[] = [
      {
        surface: 'topic-logo-image',
        topic_id: 'topic-1',
        image_id: 'image-1',
        target_url: 'https://voucha.ai/topic/photos',
        order_index: 0,
        caption: 'Logo',
      },
      {
        surface: 'topic-hero-image',
        topic_id: 'topic-1',
        image_id: 'image-1',
        target_url: 'https://voucha.ai/topic/photos',
        order_index: 1,
        caption: 'Hero',
      },
    ]
    mockResolveTargets.mockResolvedValue(choices)
    const onChange = vi.fn<(targets: CopyrightNoticeResolvedTarget[]) => void>()
    render(
      <CopyrightNoticeTargetPicker
        targets={choices}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Hosted use URL'), {
      target: { value: 'https://voucha.ai/topic/photos' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find hosted material' }))
    const logo = await screen.findByLabelText('Hosted image 1: Logo')
    const logoCheckbox = within(logo).getByRole('checkbox')
    expect(logoCheckbox).toBeChecked()
    fireEvent.click(logoCheckbox)
    expect(onChange).toHaveBeenLastCalledWith([choices[1]])
  })
})

function makeTarget(caption: string): CopyrightNoticeResolvedTarget {
  return {
    surface: 'post-image',
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
