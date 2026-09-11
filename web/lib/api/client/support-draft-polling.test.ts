import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../error'
import type { SupportMessagesResponse } from '@/types/support'
import { pollForSupportDraft } from './support-draft-polling'

function page(ids: string[], draftId?: string): SupportMessagesResponse {
  return {
    results: ids.map(id => ({
      id,
      drafted_at: id === draftId ? '2026-01-01T00:00:00Z' : null,
    })) as SupportMessagesResponse['results'],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }
}

describe('pollForSupportDraft', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the first page containing a new draft', async () => {
    const responses = [page(['existing']), page(['draft', 'existing'], 'draft')]
    let index = 0

    const result = await pollForSupportDraft({
      existingMessageIds: new Set(['existing']),
      fetchMessages: async () => responses[index++]!,
      wait: async () => {},
      attempts: 2,
    })

    expect(result?.results.map(message => message.id)).toEqual(['draft', 'existing'])
  })

  it('returns null after the configured attempts', async () => {
    const result = await pollForSupportDraft({
      existingMessageIds: new Set(['existing']),
      fetchMessages: async () => page(['existing']),
      wait: async () => {},
      attempts: 2,
    })

    expect(result).toBeNull()
  })

  it('retries a transient message fetch failure before finding the draft', async () => {
    const fetchMessages = vi
      .fn<() => Promise<SupportMessagesResponse>>()
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockRejectedValueOnce(new ApiError('Rate limited', 429))
      .mockResolvedValueOnce(page(['draft'], 'draft'))
    const wait = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

    await expect(
      pollForSupportDraft({
        existingMessageIds: new Set(['existing']),
        fetchMessages,
        wait,
        attempts: 3,
      }),
    ).resolves.toEqual(page(['draft'], 'draft'))

    expect(fetchMessages).toHaveBeenCalledTimes(3)
    expect(wait).toHaveBeenCalledTimes(2)
  })

  it('rejects definite API failures without waiting for another poll', async () => {
    const error = new ApiError('Not found', 404)
    const fetchMessages = vi.fn<() => Promise<SupportMessagesResponse>>().mockRejectedValue(error)
    const wait = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

    await expect(
      pollForSupportDraft({
        existingMessageIds: new Set(['existing']),
        fetchMessages,
        wait,
        attempts: 2,
      }),
    ).rejects.toBe(error)

    expect(fetchMessages).toHaveBeenCalledOnce()
    expect(wait).not.toHaveBeenCalled()
  })

  it('rejects a retryable message fetch failure after its final attempt', async () => {
    const error = new ApiError('Service unavailable', 503)
    const fetchMessages = vi.fn<() => Promise<SupportMessagesResponse>>().mockRejectedValue(error)
    const wait = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

    await expect(
      pollForSupportDraft({
        existingMessageIds: new Set(['existing']),
        fetchMessages,
        wait,
        attempts: 2,
      }),
    ).rejects.toBe(error)

    expect(fetchMessages).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledOnce()
  })

  it('propagates an aborted message fetch without waiting for another poll', async () => {
    const controller = new AbortController()
    const reason = new DOMException('Draft request cancelled', 'AbortError')
    const fetchMessages = vi.fn<() => Promise<SupportMessagesResponse>>().mockImplementation(() => {
      controller.abort(reason)
      return Promise.reject(reason)
    })
    const wait = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

    await expect(
      pollForSupportDraft({
        existingMessageIds: new Set(['existing']),
        fetchMessages,
        signal: controller.signal,
        wait,
        attempts: 2,
      }),
    ).rejects.toBe(reason)

    expect(fetchMessages).toHaveBeenCalledOnce()
    expect(wait).not.toHaveBeenCalled()
  })

  it('waits the configured interval before fetching a later draft', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener')
    const fetchMessages = vi
      .fn<() => Promise<SupportMessagesResponse>>()
      .mockResolvedValueOnce(page(['existing']))
      .mockResolvedValueOnce(page(['draft'], 'draft'))

    const result = pollForSupportDraft({
      existingMessageIds: new Set(['existing']),
      fetchMessages,
      signal: controller.signal,
      attempts: 2,
    })
    await vi.waitFor(() => expect(fetchMessages).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(3000)

    await expect(result).resolves.toEqual(page(['draft'], 'draft'))
    expect(fetchMessages).toHaveBeenCalledTimes(2)
    expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('rejects the delayed poll when its signal is aborted', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const reason = new DOMException('Stopped waiting for a draft', 'AbortError')
    const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener')
    const fetchMessages = vi
      .fn<() => Promise<SupportMessagesResponse>>()
      .mockResolvedValue(page(['existing']))

    const result = pollForSupportDraft({
      existingMessageIds: new Set(['existing']),
      fetchMessages,
      signal: controller.signal,
      attempts: 2,
    })
    const resultRejection = result.catch((error: unknown) => error)

    await vi.waitFor(() => expect(fetchMessages).toHaveBeenCalledOnce())
    controller.abort(reason)

    await expect(resultRejection).resolves.toBe(reason)
    expect(fetchMessages).toHaveBeenCalledOnce()
    expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('rejects the delayed poll with the abort Error reason', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const reason = new Error('Stopped waiting for a draft')
    const fetchMessages = vi
      .fn<() => Promise<SupportMessagesResponse>>()
      .mockResolvedValue(page(['existing']))

    const result = pollForSupportDraft({
      existingMessageIds: new Set(['existing']),
      fetchMessages,
      signal: controller.signal,
      attempts: 2,
    })
    const resultRejection = result.catch((error: unknown) => error)

    await vi.waitFor(() => expect(fetchMessages).toHaveBeenCalledOnce())
    controller.abort(reason)

    await expect(resultRejection).resolves.toBe(reason)
  })

  it('rejects the delayed poll with AbortError when the abort reason is not an Error', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const fetchMessages = vi
      .fn<() => Promise<SupportMessagesResponse>>()
      .mockResolvedValue(page(['existing']))

    const result = pollForSupportDraft({
      existingMessageIds: new Set(['existing']),
      fetchMessages,
      signal: controller.signal,
      attempts: 2,
    })
    const resultRejection = result.catch((error: unknown) => error)

    await vi.waitFor(() => expect(fetchMessages).toHaveBeenCalledOnce())
    controller.abort('stopped')

    await expect(resultRejection).resolves.toMatchObject({ name: 'AbortError', message: 'Aborted' })
  })

  it('does not schedule a delayed poll after its in-flight request is aborted', async () => {
    const controller = new AbortController()
    const reason = new DOMException('Draft request cancelled', 'AbortError')
    let resolveFetch: ((response: SupportMessagesResponse) => void) | undefined
    const fetchMessages = vi.fn<() => Promise<SupportMessagesResponse>>(
      () => new Promise(resolve => (resolveFetch = resolve)),
    )
    const result = pollForSupportDraft({
      existingMessageIds: new Set(['existing']),
      fetchMessages,
      signal: controller.signal,
      attempts: 2,
    })
    const resultRejection = result.catch((error: unknown) => error)

    await vi.waitFor(() => expect(fetchMessages).toHaveBeenCalledOnce())
    controller.abort(reason)
    if (!resolveFetch) throw new Error('Expected draft polling request to be pending')
    resolveFetch(page(['draft'], 'draft'))

    await expect(resultRejection).resolves.toBe(reason)
  })

  it('does not fetch when its signal is already aborted', async () => {
    const controller = new AbortController()
    const reason = new DOMException('Draft request cancelled', 'AbortError')
    controller.abort(reason)
    const fetchMessages = vi.fn<() => Promise<SupportMessagesResponse>>()

    await expect(
      pollForSupportDraft({
        existingMessageIds: new Set(),
        fetchMessages,
        signal: controller.signal,
      }),
    ).rejects.toBe(reason)

    expect(fetchMessages).not.toHaveBeenCalled()
  })
})
