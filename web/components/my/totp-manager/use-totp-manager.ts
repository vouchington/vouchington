'use client'

import { useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import {
  setupTotp,
  verifyTotpSetup,
  renameTotpAuthenticator,
  deleteTotpAuthenticator,
} from '@/lib/api/client'
import { useFreshAuthentication } from '../use-fresh-authentication'
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
  const [setupVerificationProof, setSetupVerificationProof] = useState<string | null>(null)
  const [setupName, setSetupName] = useState('')
  const authentication = useFreshAuthentication(mfaStatus)
  const reauthDialogOpen = authentication.dialogProps.open

  async function handleStartSetup(e: React.FormEvent) {
    e.preventDefault()
    setSetupVerificationProof(null)
    const reAuthToken = await authentication.requestAuthentication()
    if (!reAuthToken) return
    setLoading(true)
    try {
      const result = await setupTotp<TotpSetupData>({
        name: setupName.trim() || undefined,
        re_auth_token: reAuthToken,
      })
      setSetupData(result)
    } catch (err) {
      onError(err, {
        fallback: t('extracted.my.totpManager.failedToStartSetup_7f474813'),
        tags: { form: 'my-totp-setup' },
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmSetup() {
    const proof = await authentication.requestAuthentication()
    if (!proof) return
    setSetupCode('')
    setSetupVerificationProof(proof)
  }

  async function handleVerifySetup(code: string) {
    if (!setupData || !setupVerificationProof || code.length < 6) return
    setLoading(true)
    try {
      const result = await verifyTotpSetup<{ authenticator: TotpAuthenticator }>({
        authenticator_id: setupData.authenticator.id,
        re_auth_token: setupVerificationProof,
        code,
      })
      addAuthenticator(result.authenticator)
      setStep('list')
      setSetupData(null)
      setSetupCode('')
      setSetupVerificationProof(null)
      setSetupName('')
      onSuccess(t('extracted.my.totpManager.authenticatorAddedSuccessfully_960de9d4'))
    } catch (err) {
      onError(err, {
        fallback: t('extracted.my.totpManager.failedToVerifyCode_eff1b93c'),
        tags: { form: 'my-totp-setup' },
      })
      setSetupCode('')
    } finally {
      setLoading(false)
    }
  }

  function handleCancelSetup() {
    setStep('list')
    setSetupData(null)
    setSetupCode('')
    setSetupVerificationProof(null)
    setSetupName('')
  }

  async function handleRename(authenticatorId: string) {
    setLoading(true)
    try {
      await renameTotpAuthenticator(authenticatorId, renameName.trim())
      renameAuthenticatorLocally(authenticatorId, renameName.trim())
      setRenamingId(null)
      setRenameName('')
      onSuccess(t('extracted.my.totpManager.authenticatorRenamed_10c7a3d6'))
    } catch (err) {
      onError(err, {
        fallback: t('extracted.my.totpManager.failedToRenameAuthenticator_373f9607'),
        tags: { form: 'my-totp' },
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(authenticatorId: string) {
    const reAuthToken = await authentication.requestAuthentication()
    if (!reAuthToken) return
    setLoading(true)
    try {
      await deleteTotpAuthenticator(authenticatorId, reAuthToken)
      removeAuthenticatorLocally(authenticatorId)
      setConfirmingDeleteId(null)
      onSuccess(t('extracted.my.totpManager.authenticatorRemoved_151cad93'))
    } catch (err) {
      onError(err, {
        fallback: t('extracted.my.totpManager.failedToRemoveAuthenticator_07cfc08f'),
        tags: { form: 'my-totp' },
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveWithReauth = authentication.dialogProps.onVerified
  const handleCloseReauthDialog = authentication.dialogProps.onClose

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
    setupVerificationProof,
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
    handleConfirmSetup,
    handleVerifySetup,
    handleCancelSetup,
    handleRename,
    handleRemoveClick: setConfirmingDeleteId,
    handleRemove,
    handleRemoveWithReauth,
    handleCloseReauthDialog,
  }
}
