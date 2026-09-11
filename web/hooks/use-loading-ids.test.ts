import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLoadingIds } from './use-loading-ids'

describe('useLoadingIds', () => {
  it('adds and removes a loading id directly', async () => {
    const { result } = renderHook(() => useLoadingIds())
    act(() => result.current.addLoadingId('save'))
    expect(result.current.loadingIds.has('save')).toBe(true)
    act(() => result.current.removeLoadingId('save'))
    expect(result.current.loadingIds.has('save')).toBe(false)
  })

  it('sets a loading id while a task is pending and clears it after success', async () => {
    let resolveTask!: () => void
    const task = new Promise<void>(resolve => {
      resolveTask = resolve
    })
    const { result } = renderHook(() => useLoadingIds())
    let runningTask!: Promise<void>

    act(() => {
      runningTask = result.current.runWithLoadingId('save', () => task)
    })
    await waitFor(() => expect(result.current.loadingIds.has('save')).toBe(true))
    await act(async () => {
      resolveTask()
      await runningTask
    })

    expect(result.current.loadingIds.has('save')).toBe(false)
  })

  it('clears a loading id after a task rejects', async () => {
    const { result } = renderHook(() => useLoadingIds())

    await expect(
      act(async () => {
        await result.current.runWithLoadingId('delete', async () => {
          throw new Error('failed')
        })
      }),
    ).rejects.toThrow('failed')

    expect(result.current.loadingIds.has('delete')).toBe(false)
  })

  it('keeps a loading id until all concurrent tasks with that id settle', async () => {
    let resolveFirst!: () => void
    let resolveSecond!: () => void
    const first = new Promise<void>(resolve => {
      resolveFirst = resolve
    })
    const second = new Promise<void>(resolve => {
      resolveSecond = resolve
    })
    const { result } = renderHook(() => useLoadingIds())
    let firstTask!: Promise<void>
    let secondTask!: Promise<void>

    act(() => {
      firstTask = result.current.runWithLoadingId('add', () => first)
      secondTask = result.current.runWithLoadingId('add', () => second)
    })

    await waitFor(() => expect(result.current.loadingIds.has('add')).toBe(true))

    await act(async () => {
      resolveFirst()
      await firstTask
    })

    expect(result.current.loadingIds.has('add')).toBe(true)

    await act(async () => {
      resolveSecond()
      await secondTask
    })

    expect(result.current.loadingIds.has('add')).toBe(false)
  })
})
