import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TurnstileApi, TurnstileRenderParameters } from '@vouchington/script-loader/turnstile'
import { requestBotChallengeToken } from '../bot-challenge'

describe('browser bot challenge', () => {
  afterEach(() => {
    delete window.turnstile
    document.body.replaceChildren()
    document.head
      .querySelectorAll('script[src*="challenges.cloudflare.com/turnstile"]')
      .forEach(script => script.remove())
  })

  it('renders the canonical operation, resolves its token, and removes the widget', async () => {
    let options: TurnstileRenderParameters | undefined
    let dialogDescription: string | null = null
    let dialogTitle: string | null = null
    let focusedDuringChallenge: Element | null = null
    const remove = vi.fn<TurnstileApi['remove']>()
    const previousFocus = document.createElement('button')
    document.body.append(previousFocus)
    previousFocus.focus()
    const result = requestBotChallengeToken('bot-challenge.mutation')
    const script = await nextTurnstileScript()
    window.turnstile = turnstile({
      remove,
      render: vi.fn<TurnstileApi['render']>((_container, value) => {
        options = value
        dialogDescription = document.querySelector('[role="dialog"] p')?.textContent ?? null
        dialogTitle = document.querySelector('[role="dialog"] h2')?.textContent ?? null
        focusedDuringChallenge = document.activeElement
        queueMicrotask(() => value.callback?.('single-use-proof'))
        return 'widget-id'
      }),
    })
    script.dispatchEvent(new Event('load'))

    await expect(result).resolves.toBe('single-use-proof')
    expect(options).toMatchObject({
      action: 'bot-challenge-mutation',
      appearance: 'interaction-only',
    })
    expect(dialogTitle).toBe('Security verification')
    expect(dialogDescription).toBe('Complete the security verification to continue.')
    expect(focusedDuringChallenge).toBeInstanceOf(HTMLElement)
    expect((focusedDuringChallenge as Element | null)?.getAttribute('role')).toBe('dialog')
    expect(remove).toHaveBeenCalledWith('widget-id')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(previousFocus)
  })

  it('serializes concurrent challenges so only one dialog is active', async () => {
    const activeDialogCounts: number[] = []
    let renderCount = 0
    window.turnstile = turnstile({
      render: vi.fn<TurnstileApi['render']>((_container, options) => {
        renderCount += 1
        activeDialogCounts.push(document.querySelectorAll('[role="dialog"]').length)
        const proof = renderCount === 1 ? 'first-proof' : 'second-proof'
        queueMicrotask(() => options.callback?.(proof))
        return `widget-${renderCount}`
      }),
    })

    const first = requestBotChallengeToken('bot-challenge.mutation')
    const second = requestBotChallengeToken('bot-challenge.mutation')
    await expect(first).resolves.toBe('first-proof')
    await expect(second).resolves.toBe('second-proof')
    expect(activeDialogCounts).toEqual([1, 1])
  })

  it('restores focus when the user cancels the dialog', async () => {
    const previousFocus = document.createElement('button')
    document.body.append(previousFocus)
    previousFocus.focus()
    window.turnstile = turnstile({})

    const result = requestBotChallengeToken('bot-challenge.mutation')
    const rejection = result.catch(err => err as unknown)
    const dialog = await nextDialog()
    dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))

    await expect(rejection).resolves.toMatchObject({ name: 'AbortError' })
    expect(document.activeElement).toBe(previousFocus)
  })

  it('resets an expired challenge', async () => {
    let options: TurnstileRenderParameters | undefined
    const reset = vi.fn<TurnstileApi['reset']>()
    window.turnstile = turnstile({
      reset,
      render: vi.fn<TurnstileApi['render']>((_container, value) => {
        options = value
        queueMicrotask(() => {
          value['expired-callback']?.()
          value.callback?.('loaded-proof')
        })
        return 'loaded-widget'
      }),
    })
    await expect(requestBotChallengeToken('bot-challenge.mutation')).resolves.toBe('loaded-proof')
    expect(options).toBeDefined()
    expect(reset).toHaveBeenCalledWith('loaded-widget')
  })

  it('rejects without rendering when the request is already aborted', async () => {
    const render = vi.fn<TurnstileApi['render']>()
    window.turnstile = turnstile({ render })
    const controller = new AbortController()
    controller.abort()
    await expect(
      requestBotChallengeToken('bot-challenge.mutation', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(render).not.toHaveBeenCalled()
  })
})

function turnstile(overrides: Partial<TurnstileApi>): TurnstileApi {
  return {
    getResponse: vi.fn<TurnstileApi['getResponse']>(),
    remove: vi.fn<TurnstileApi['remove']>(),
    render: vi.fn<TurnstileApi['render']>(() => 'widget-id'),
    reset: vi.fn<TurnstileApi['reset']>(),
    ...overrides,
  }
}

function nextTurnstileScript(): Promise<HTMLScriptElement> {
  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const script = document.head.querySelector<HTMLScriptElement>(
        'script[src*="challenges.cloudflare.com/turnstile"]',
      )
      if (!script) return
      observer.disconnect()
      resolve(script)
    })
    observer.observe(document.head, { childList: true })
  })
}

function nextDialog(): Promise<HTMLElement> {
  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')
      if (!dialog) return
      observer.disconnect()
      resolve(dialog)
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
}
