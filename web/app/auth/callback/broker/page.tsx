'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { acknowledgeOAuthAuthorization, completeOAuthAuthorization } from '@/lib/api/client'
import { ApiError } from '@vouchington/api-client'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getWindowOpener } from '@/lib/auth/window-opener'
import { waitForOAuthBrokerReceipt } from './oauth-broker-receipt'

const POLL_INTERVAL_MS = 1000

type CompletionResponse =
  | { status: 'pending' }
  | { mfa_required: true; login_attempt_id: string }
  | { user: { id: string } }
  | { oauth_account: { id: string } }

type OAuthBrokerCompletionMessage =
  | {
      type: 'voucha:oauth-broker:complete'
      flowId: string
      status: 'authenticated' | 'connected'
    }
  | {
      type: 'voucha:oauth-broker:complete'
      flowId: string
      status: 'mfa_required'
      loginAttemptId: string
    }

function scheduleOAuthCompletion(callback: () => void): () => void {
  const timeout = window.setTimeout(callback, POLL_INTERVAL_MS)
  return () => window.clearTimeout(timeout)
}

export default function OAuthBrokerCallbackPage() {
  return (
    <Suspense fallback={<OAuthBrokerStatus />}>
      <OAuthBrokerCallbackContent />
    </Suspense>
  )
}

function OAuthBrokerCallbackContent() {
  const searchParams = useSearchParams()
  const [failed, setFailed] = useState(false)
  const flowId = searchParams.get('flow_id')
  const missingFlowId = !flowId

  useEffect(() => {
    if (!flowId) return undefined
    const activeFlowId = flowId
    const lifetime = new AbortController()
    const pending: { cancelPoll?: () => void; cancelReceipt?: () => void } = {}

    async function complete() {
      try {
        const result = await completeOAuthAuthorization<CompletionResponse>(activeFlowId)
        if (lifetime.signal.aborted) return
        if ('status' in result && result.status === 'pending') {
          pending.cancelPoll = scheduleOAuthCompletion(complete)
          return
        }
        const opener = getWindowOpener()
        if (!opener) {
          setFailed(true)
          return
        }
        const completionMessage: OAuthBrokerCompletionMessage =
          'mfa_required' in result
            ? {
                type: 'voucha:oauth-broker:complete',
                flowId: activeFlowId,
                status: 'mfa_required',
                loginAttemptId: result.login_attempt_id,
              }
            : {
                type: 'voucha:oauth-broker:complete',
                flowId: activeFlowId,
                status: 'user' in result ? 'authenticated' : 'connected',
              }
        const receipt = waitForOAuthBrokerReceipt(opener, activeFlowId)
        pending.cancelReceipt = receipt.cancel
        opener.postMessage(completionMessage, window.location.origin)
        if (!(await receipt.result)) {
          if (!lifetime.signal.aborted) setFailed(true)
          return
        }
        if (lifetime.signal.aborted) return
        await acknowledgeOAuthAuthorization(activeFlowId)
        if (lifetime.signal.aborted) return
        window.close()
      } catch (err) {
        if (!lifetime.signal.aborted) {
          if (isRetryableCompletionError(err)) {
            pending.cancelPoll = scheduleOAuthCompletion(complete)
            return
          }
          const opener = getWindowOpener()
          if (opener) {
            opener.postMessage(
              {
                type: 'voucha:oauth-broker:complete',
                flowId: activeFlowId,
                status: 'failed',
              },
              window.location.origin,
            )
            window.close()
          } else {
            setFailed(true)
          }
        }
      }
    }

    void complete()
    return () => {
      lifetime.abort()
      pending.cancelPoll?.()
      pending.cancelReceipt?.()
    }
  }, [flowId])

  return <OAuthBrokerStatus failed={failed || missingFlowId} />
}

function isRetryableCompletionError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 429 || error.status >= 500)
}

function OAuthBrokerStatus({ failed = false }: { failed?: boolean }) {
  const t = useTranslations()
  if (failed) {
    return (
      <OAuthBrokerStatusContent
        dataPw='oauth-broker-callback-error'
        message={t('extracted.auth.loginForm.unableToConnectPleaseTryAgain_a2f03233')}
      />
    )
  }
  return <OAuthBrokerStatusContent message={t('extracted.github.page.completingSignIn_f0e27215')} />
}

function OAuthBrokerStatusContent({
  dataPw = 'oauth-broker-callback-loading',
  message,
}: {
  dataPw?: 'oauth-broker-callback-loading' | 'oauth-broker-callback-error'
  message: string
}) {
  const t = useTranslations()
  return (
    <div
      className='flex min-h-screen items-center justify-center'
      data-pw={dataPw}
    >
      <h1 className='sr-only'>{t('extracted.github.page.completingSignIn_f0e27215')}</h1>
      <p className='text-sm text-muted-foreground'>{message}</p>
    </div>
  )
}
