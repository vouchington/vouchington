'use client'

import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import { createTranslator } from '@ts-shared/ui-messages'
import {
  deserializeCatalog,
  type SerializableCatalog,
} from '@ts-shared/ui-messages/catalog-bootstrap'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'
import { BotChallengeDialog } from './bot-challenge-dialog'

let challengeQueue: Promise<void> = Promise.resolve()
const settleChallengeQueue = () => undefined

export function requestBotChallengeToken(action: string, signal?: AbortSignal): Promise<string> {
  const result = challengeQueue.then(() => renderBotChallenge(action, signal))
  challengeQueue = result.then(settleChallengeQueue, settleChallengeQueue)
  return result
}

function renderBotChallenge(action: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  const previouslyFocused = document.activeElement
  const mount = document.createElement('div')
  document.body.append(mount)
  const root = createRoot(mount)

  return new Promise<string>((resolve, reject) => {
    let settled = false
    let onAbort: () => void = () => undefined
    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      queueMicrotask(() => {
        root.unmount()
        mount.remove()
        if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
          previouslyFocused.focus()
        }
        callback()
      })
    }
    onAbort = () => settle(() => reject(abortError(signal)))
    const onCancel = () =>
      settle(() => reject(new DOMException('The request was canceled', 'AbortError')))
    signal?.addEventListener('abort', onAbort, { once: true })
    const messages = botChallengeMessages()

    root.render(
      createElement(BotChallengeDialog, {
        actionTag: action,
        description: messages.description,
        title: messages.title,
        onCancel,
        onError: error => settle(() => reject(error)),
        onSuccess: token => settle(() => resolve(token)),
      }),
    )
  })
}

function botChallengeMessages(): { description: string; title: string } {
  const bootstrap = Reflect.get(window, '__UI_MESSAGES__') as
    | { catalog: SerializableCatalog; locale: string }
    | undefined
  const t = bootstrap
    ? createTranslator(bootstrap.locale, deserializeCatalog(bootstrap.catalog))
    : defaultTranslator
  return {
    description: t('shared.botChallenge.completeToContinue'),
    title: t('shared.botChallenge.securityVerification'),
  }
}

function abortError(signal: AbortSignal | undefined): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException('The request was aborted', 'AbortError')
}
