import { describe, expect, it, vi } from 'vitest'

import type { BrowserContext, Dialog, Page, TestInfo } from '@playwright/test'

import { BrowserIssueMonitor } from '../browser-errors.mts'

type Listener = (...args: never[]) => void

class MockBrowserContext {
  readonly listeners = new Map<string, Set<Listener>>()

  emit(event: string, ...args: never[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args)
    }
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener)
    return this
  }

  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(event, listeners)
    return this
  }

  pages() {
    return []
  }
}

function createTestInfo() {
  const attachments: { body: Buffer; contentType: string; name: string }[] = []
  const testInfo = {
    attach: vi.fn<(...args: Array<never>) => unknown>(
      (name: string, options: { body: Buffer; contentType: string }) => {
        attachments.push({ name, ...options })
        return Promise.resolve()
      },
    ),
  } as unknown as TestInfo
  return { attachments, testInfo }
}

function createPage(url = 'http://localhost:8787/path') {
  return {
    url: () => url,
  } as Page
}

function createDialog(
  overrides: Partial<{
    defaultValue: string
    dismiss: () => Promise<void>
    message: string
    page: null | Page
    type: string
  }> = {},
) {
  const {
    defaultValue = '',
    dismiss = vi.fn<() => Promise<void>>(() => Promise.resolve()),
    message = 'Unexpected confirmation dialog',
    page = createPage(),
    type = 'confirm',
  } = overrides

  return {
    defaultValue: () => defaultValue,
    dismiss,
    message: () => message,
    page: () => page,
    type: () => type,
  } as unknown as Dialog
}

describe('BrowserIssueMonitor browser dialogs', () => {
  it('fails on unexpected browser dialogs and dismisses them', async () => {
    const { attachments, testInfo } = createTestInfo()
    const context = new MockBrowserContext()
    const monitor = new BrowserIssueMonitor(testInfo)
    monitor.monitorContext(context as unknown as BrowserContext)
    const dismiss = vi.fn<() => Promise<void>>(() => Promise.resolve())

    context.emit(
      'dialog',
      createDialog({
        defaultValue: 'seeded default',
        dismiss,
        message: 'Delete this seeded record?',
        type: 'prompt',
      }) as never,
    )

    await expect(monitor.assertNoIssues()).rejects.toThrow(/dialog/)
    expect(dismiss).toHaveBeenCalledOnce()
    const body = attachments[0]?.body.toString()
    expect(body).toContain('[dialog]')
    expect(body).toContain('Type: prompt')
    expect(body).toContain('Default: seeded default')
    expect(body).toContain('Delete this seeded record?')
  })

  it('omits empty default values from dialog issue attachments', async () => {
    const { attachments, testInfo } = createTestInfo()
    const context = new MockBrowserContext()
    const monitor = new BrowserIssueMonitor(testInfo)
    monitor.monitorContext(context as unknown as BrowserContext)

    context.emit('dialog', createDialog({ message: 'Empty default confirmation' }) as never)

    await expect(monitor.assertNoIssues()).rejects.toThrow(/dialog/)
    const body = attachments[0]?.body.toString()
    expect(body).toContain('Empty default confirmation')
    expect(body).not.toContain('Default:')
  })

  it('allows specific expected dialogs with a reason', async () => {
    const { testInfo } = createTestInfo()
    const context = new MockBrowserContext()
    const dismiss = vi.fn<() => Promise<void>>(() => Promise.resolve())
    const monitor = new BrowserIssueMonitor(testInfo, {
      allowlist: [
        {
          pattern: /legacy fixture alert/,
          reason: 'This spec intentionally verifies legacy dialog copy',
          type: 'dialog',
        },
      ],
    })
    monitor.monitorContext(context as unknown as BrowserContext)

    context.emit('dialog', createDialog({ dismiss, message: 'legacy fixture alert' }) as never)

    await expect(monitor.assertNoIssues()).resolves.toBeUndefined()
    expect(dismiss).not.toHaveBeenCalled()
  })
})
