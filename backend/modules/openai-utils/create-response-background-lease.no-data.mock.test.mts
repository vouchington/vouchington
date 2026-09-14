import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOpenAIResponse } from './create-response.mts'
import { runWithBackgroundResponseHooks } from './background-response-context.mts'
import {
  makeResponseStream,
  makeSdkResponse,
  makeSdkTextResponse,
  makeStreamEvent,
} from '../../test-helpers/modules/openai-utils/responses.mts'

type CreateMock = (
  params: Parameters<typeof createOpenAIResponse>[0],
  options: Parameters<typeof createOpenAIResponse>[1],
) => Promise<unknown>
type CancelMock = (responseId: string, options?: unknown) => Promise<unknown>

const openAIMocks = vi.hoisted(() => ({
  create: vi.fn<CreateMock>(),
  cancel: vi.fn<CancelMock>(),
}))

vi.mock<typeof import('openai')>(import('openai'), async importOriginal => ({
  ...(await importOriginal()),
  default: class MockOpenAI {
    responses = {
      create: openAIMocks.create,
      cancel: openAIMocks.cancel,
    }
  } as unknown as typeof import('openai').default,
}))

describe('background OpenAI response lease integration', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    openAIMocks.create.mockReset()
    openAIMocks.cancel.mockReset()
  })

  it('settles the lease after notifying hooks with the created response id', async () => {
    const response = makeSdkTextResponse('hello', { id: 'resp-hooked' })
    openAIMocks.create.mockResolvedValueOnce(
      makeResponseStream([
        makeStreamEvent({
          type: 'response.created',
          sequence_number: 1,
          response: makeSdkResponse({ status: 'in_progress', id: 'resp-hooked' }),
        }),
        makeStreamEvent({ type: 'response.completed', sequence_number: 2, response }),
      ]),
    )
    const stopAndSettle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const onResponseCreated = vi
      .fn<(responseId: string) => Promise<{ stopAndSettle: () => Promise<void> }>>()
      .mockResolvedValue({ stopAndSettle })

    await runWithBackgroundResponseHooks({ onResponseCreated }, () =>
      createOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }),
    )

    expect(onResponseCreated).toHaveBeenCalledExactlyOnceWith('resp-hooked')
    expect(stopAndSettle).toHaveBeenCalledTimes(1)
  })

  it('awaits lease acquisition before an interrupted drain can cancel', async () => {
    let releaseRegistration: (() => void) | undefined
    const registrationGate = new Promise<void>(resolve => {
      releaseRegistration = resolve
    })
    const cause = new Error('socket closed')
    const failingStream: AsyncIterable<ReturnType<typeof makeStreamEvent>> = {
      async *[Symbol.asyncIterator]() {
        yield makeStreamEvent({
          type: 'response.created',
          sequence_number: 1,
          response: makeSdkResponse({ status: 'in_progress', id: 'resp-barrier' }),
        })
        throw cause
      },
    }
    openAIMocks.create.mockResolvedValueOnce(failingStream)
    openAIMocks.cancel.mockResolvedValueOnce(
      makeSdkResponse({ status: 'cancelled', id: 'resp-barrier' }),
    )
    const stopAndSettle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const onResponseCreated = vi.fn<
      (responseId: string) => Promise<{ stopAndSettle: () => Promise<void> }>
    >(async () => {
      await registrationGate
      return { stopAndSettle }
    })

    const response = runWithBackgroundResponseHooks({ onResponseCreated }, () =>
      createOpenAIResponse({ model: 'gpt-4.1-mini', input: 'hello' }),
    )
    const responseRejection = response.catch((error: unknown) => error)
    await vi.waitFor(() => expect(onResponseCreated).toHaveBeenCalledTimes(1))
    expect(openAIMocks.cancel).not.toHaveBeenCalled()

    releaseRegistration?.()
    await expect(responseRejection).resolves.toMatchObject({ cause })
    expect(openAIMocks.cancel).toHaveBeenCalledExactlyOnceWith('resp-barrier', {
      maxRetries: 0,
      timeout: 10_000,
    })
    expect(stopAndSettle).toHaveBeenCalledTimes(1)
  })
})
