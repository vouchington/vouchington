'use client'

import { useReducer } from 'react'
import onError from '@/lib/on-error/on-error'
import {
  issueVerificationToken,
  verifyDomain,
  submitForManualReview,
} from '@/lib/api/client/topic-claims'
import { DomainTabs } from './domain-tabs'
import type { TopicClaim } from '@/types/topic-claims'
import { useTranslations } from '@/lib/i18n/use-translations'

interface TokenState {
  raw_token: string
  dns_instructions: { hostname: string; value: string }
  well_known_instructions: { url: string; file_content: string }
}

interface State {
  token: TokenState | null
  evidence: string
  loading: string | null
  error: string | null
  copied: boolean
}

type Action =
  | { type: 'set_token'; token: TokenState }
  | { type: 'set_evidence'; text: string }
  | { type: 'set_loading'; key: string | null }
  | { type: 'set_error'; message: string | null }
  | { type: 'set_copied'; value: boolean }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'set_token': {
      return { ...state, token: action.token }
    }
    case 'set_evidence': {
      return { ...state, evidence: action.text }
    }
    case 'set_loading': {
      return { ...state, loading: action.key }
    }
    case 'set_error': {
      return { ...state, error: action.message }
    }
    case 'set_copied': {
      return { ...state, copied: action.value }
    }
  }
}

interface DomainVerificationPanelProps {
  topicIdOrSlug: string
  claim: TopicClaim
  onVerified: (claim: TopicClaim) => void
  hasHostname: boolean
}

export function DomainVerificationPanel({
  topicIdOrSlug,
  claim,
  onVerified,
  hasHostname,
}: DomainVerificationPanelProps) {
  const t = useTranslations()
  const [state, dispatch] = useReducer(reducer, {
    token: null,
    evidence: '',
    loading: null,
    error: null,
    copied: false,
  })

  async function handleIssueToken() {
    dispatch({ type: 'set_loading', key: 'issue' })
    dispatch({ type: 'set_error', message: null })
    try {
      const result = await issueVerificationToken(topicIdOrSlug, claim.id)
      dispatch({ type: 'set_token', token: result })
    } catch (error) {
      dispatch({
        type: 'set_error',
        message:
          error instanceof Error
            ? error.message
            : t('extracted.topicClaims.domainVerificationPanel.failedToIssueToken_b76a4335'),
      })
      onError(error, {
        fallback: t('extracted.topicClaims.domainVerificationPanel.anErrorOccurred_ddf785b7'),
      })
    } finally {
      dispatch({ type: 'set_loading', key: null })
    }
  }

  async function handleVerify() {
    dispatch({ type: 'set_loading', key: 'verify' })
    dispatch({ type: 'set_error', message: null })
    try {
      const result = await verifyDomain(topicIdOrSlug, claim.id)
      onVerified(result.claim)
    } catch (error) {
      dispatch({
        type: 'set_error',
        message:
          error instanceof Error
            ? error.message
            : t(
                'extracted.topicClaims.domainVerificationPanel.verificationFailedEnsureTheRecordOr_f6f70347',
              ),
      })
      /* c8 ignore next -- error path requires injecting a verification failure */
      onError(error, {
        fallback: t('extracted.topicClaims.domainVerificationPanel.anErrorOccurred_ddf785b7'),
      })
    } finally {
      dispatch({ type: 'set_loading', key: null })
    }
  }

  async function handleManualSubmit() {
    if (!state.evidence.trim()) return
    dispatch({ type: 'set_loading', key: 'manual' })
    dispatch({ type: 'set_error', message: null })
    try {
      const result = await submitForManualReview(topicIdOrSlug, claim.id, state.evidence)
      onVerified(result.claim)
    } catch (error) {
      dispatch({
        type: 'set_error',
        message:
          error instanceof Error
            ? error.message
            : t('extracted.topicClaims.domainVerificationPanel.failedToSubmitForReview_6a8b0d31'),
      })
      onError(error, {
        fallback: t('extracted.topicClaims.domainVerificationPanel.anErrorOccurred_ddf785b7'),
      })
    } finally {
      dispatch({ type: 'set_loading', key: null })
    }
  }

  function handleCopy(text: string) {
    void navigator.clipboard.writeText(text).then(() => {
      dispatch({ type: 'set_copied', value: true })
      setTimeout(() => dispatch({ type: 'set_copied', value: false }), 2000)
    })
  }

  return (
    <div
      className='space-y-4'
      data-pw='domain-verification-panel'
    >
      <DomainTabs
        hasHostname={hasHostname}
        token={state.token}
        evidence={state.evidence}
        loading={state.loading}
        copied={state.copied}
        onIssueToken={handleIssueToken}
        onVerify={handleVerify}
        onCopy={handleCopy}
        onEvidenceChange={text => dispatch({ type: 'set_evidence', text })}
        onManualSubmit={handleManualSubmit}
      />
      {state.error ? (
        <p
          className='text-sm text-destructive'
          data-pw='verification-error'
        >
          {state.error}
        </p>
      ) : null}
    </div>
  )
}
