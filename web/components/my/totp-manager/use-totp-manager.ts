'use client'

import { useRef, useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import {
  setupTotp,
  verifyTotpSetup,
  renameTotpAuthenticator,
  deleteTotpAuthenticator,
} from '@/lib/api/client'
import { ApiError } from '@/lib/api/error'
import type { ListResponse } from '@/types/api-responses'
import type { MfaStatus, TotpAuthenticator } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { TotpSetupData } from './setup-flow'
import { useTotpPagination } from './use-totp-pagination'

type Step = 'list' | 'setup'

export function useTotpManager(initialData: ListResponse<TotpAuthenticator>, mfaStatus: MfaStatus) {
  const t = useTranslations()
  const {
    authenticators,
    pagination,
    netAuthenticatorCountDelta,
    addAuthenticator,
    renameAuthenticatorLocally,
    removeAuthenticatorLocally,
  } = useTotpPagination(initialData)
  const [step, setStep] = useState<Step>('list')
  const [loading, setLoading] = useState(false)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [setupData, setSetupData] = useState<TotpSetupData | null>(null)
  const [setupCode, setSetupCode] = useState('')
  const [setupName, setSetupName] = useState('')
  const [reauthDialogOpen, setReauthDialogOpen] = useState(false)
  const pendingDeleteIdRef = useRef<string | null>(null)

  async function handleStartSetup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await setupTotp<TotpSetupData>({ name: setupName.trim() || undefined })
      setSetupData(result)
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.totpManager.failedToStartSetup_7f474813'),
        tags: { form: 'my-totp-setup' },
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifySetup(code: string) {
    if (!setupData || code.length < 6) return
    setLoading(true)
    try {
      const result = await verifyTotpSetup<{ authenticator: TotpAuthenticator }>({
        authenticator_id: setupData.authenticator.id,
        code,
      })
      addAuthenticator(result.authenticator)
      setStep('list')
      setSetupData(null)
      setSetupCode('')
      setSetupName('')
      onSuccess(t('extracted.my.totpManager.authenticatorAddedSuccessfully_960de9d4'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.totpManager.failedToVerifyCode_eff1b93c'),
        tags: { form: 'my-totp-setup' },
      })
      setSetupCode('')
    } finally {
      setLoading(false)
    }
  }

  async function handleRename(authenticatorId: string) {
    setLoading(true)
    try {
      await renameTotpAuthenticator(authenticatorId, renameName.trim())
      renameAuthenticatorLocally(authenticatorId, renameName.trim())
      setRenamingId(null)
      setRenameName('')
      onSuccess(t('extracted.my.totpManager.authenticatorRenamed_10c7a3d6'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.totpManager.failedToRenameAuthenticator_373f9607'),
        tags: { form: 'my-totp' },
      })
    } finally {
      setLoading(false)
    }
  }

  function handleRemoveClick(authenticatorId: string) {
    // Use the server-reported totals, not the accumulated-pages array length: the
    // paginated list only reflects the pages loaded so far, which undercounts once a
    // later page hasn't been fetched yet. mfaStatus is also a static snapshot fetched
    // once at page load, so it doesn't reflect authenticators added or removed locally
    // this session (e.g. right after verifying a new TOTP setup) —
    // netAuthenticatorCountDelta corrects for that on top of the server-reported
    // baseline.
    const totalMfa = mfaStatus.passkeys_count + mfaStatus.totp_count + netAuthenticatorCountDelta
    if (totalMfa <= 1) {
      pendingDeleteIdRef.current = authenticatorId
      setConfirmingDeleteId(null)
      setReauthDialogOpen(true)
      return
    }
    setConfirmingDeleteId(authenticatorId)
  }

  async function handleRemove(authenticatorId: string, reAuthToken?: string) {
    setLoading(true)
    try {
      await deleteTotpAuthenticator(authenticatorId, reAuthToken)
      removeAuthenticatorLocally(authenticatorId)
      setConfirmingDeleteId(null)
      onSuccess(t('extracted.my.totpManager.authenticatorRemoved_151cad93'))
    } catch (error) {
      if (error instanceof ApiError && error.code === 'MFA_REAUTH_REQUIRED') {
        pendingDeleteIdRef.current = authenticatorId
        setConfirmingDeleteId(null)
        setReauthDialogOpen(true)
      } else {
        onError(error, {
          fallback: t('extracted.my.totpManager.failedToRemoveAuthenticator_07cfc08f'),
          tags: { form: 'my-totp' },
        })
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveWithReauth(reAuthToken: string) {
    const pendingDeleteId = pendingDeleteIdRef.current
    if (!pendingDeleteId) return
    pendingDeleteIdRef.current = null
    setReauthDialogOpen(false)
    await handleRemove(pendingDeleteId, reAuthToken)
  }

  function handleCloseReauthDialog() {
    setReauthDialogOpen(false)
    pendingDeleteIdRef.current = null
  }

  return {
    authenticators,
    pagination,
    step,
    loading,
    confirmingDeleteId,
    renamingId,
    renameName,
    setupData,
    setupCode,
    setupName,
    reauthDialogOpen,
    setStep,
    setConfirmingDeleteId,
    setRenamingId,
    setRenameName,
    setSetupCode,
    setSetupData,
    setSetupName,
    handleStartSetup,
    handleVerifySetup,
    handleRename,
    handleRemoveClick,
    handleRemove,
    handleRemoveWithReauth,
    handleCloseReauthDialog,
  }
}
