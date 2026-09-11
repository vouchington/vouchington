'use client'

import { useRef, useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { startRegistration, type StartRegistrationOpts } from '@simplewebauthn/browser'
import {
  deletePasskey,
  getPasskeyRegistrationOptions,
  renamePasskey,
  verifyPasskeyRegistration,
} from '@/lib/api/client'
import { ApiError } from '@/lib/api/error'
import type { ListResponse } from '@/types/api-responses'
import type { MfaStatus, Passkey } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'
import { usePasskeyPagination } from './use-passkey-pagination'

type Step = 'list' | 'add'

export function usePasskeyManager(initialData: ListResponse<Passkey>, mfaStatus: MfaStatus) {
  const t = useTranslations()
  const {
    passkeys,
    pagination,
    netPasskeyCountDelta,
    addPasskey,
    renamePasskeyLocally,
    removePasskeyLocally,
  } = usePasskeyPagination(initialData)
  const [step, setStep] = useState<Step>('list')
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [reauthDialogOpen, setReauthDialogOpen] = useState(false)
  const pendingDeleteIdRef = useRef<string | null>(null)

  async function handleAddPasskey(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      interface RegOptionsResponse {
        options: StartRegistrationOpts['optionsJSON']
      }
      const { options } = await getPasskeyRegistrationOptions<RegOptionsResponse>()

      const registrationResponse = await startRegistration({ optionsJSON: options })

      const { passkey } = await verifyPasskeyRegistration<{ passkey: Passkey }>({
        response: registrationResponse,
        name: newName.trim() || t('extracted.my.passkeyManager.myPasskey_e8f5c02d'),
      })

      addPasskey(passkey)
      setStep('list')
      setNewName('')
      onSuccess(t('extracted.my.passkeyManager.passkeyAddedSuccessfully_6cfc7389'))
    } catch (error) {
      if (error instanceof Error && error.name === 'NotAllowedError') {
        onError(error, {
          fallback: t('extracted.my.passkeyManager.passkeyRegistrationWasCancelled_230bcff5'),
          tags: { form: 'my-passkey' },
          skipSentry: true,
        })
      } else {
        onError(error, {
          fallback: t('extracted.my.passkeyManager.failedToAddPasskey_ae611a4c'),
          tags: { form: 'my-passkey' },
        })
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleRename(passkeyId: string) {
    setLoading(true)
    try {
      await renamePasskey(passkeyId, renameName.trim())
      renamePasskeyLocally(passkeyId, renameName.trim())
      setRenamingId(null)
      setRenameName('')
      onSuccess(t('extracted.my.passkeyManager.passkeyRenamed_9bfc231d'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.passkeyManager.failedToRenamePasskey_bfdf3db4'),
        tags: { form: 'my-passkey' },
      })
    } finally {
      setLoading(false)
    }
  }

  function handleRemoveClick(passkeyId: string) {
    // Use the server-reported totals, not the accumulated-pages array length: the
    // paginated list only reflects the pages loaded so far, which undercounts once a
    // later page hasn't been fetched yet. mfaStatus is also a static snapshot fetched
    // once at page load, so it doesn't reflect passkeys added or removed locally this
    // session (e.g. right after registering a new passkey) — netPasskeyCountDelta
    // corrects for that on top of the server-reported baseline.
    const totalMfa = mfaStatus.passkeys_count + netPasskeyCountDelta + mfaStatus.totp_count
    if (totalMfa <= 1) {
      pendingDeleteIdRef.current = passkeyId
      setConfirmingDeleteId(null)
      setReauthDialogOpen(true)
      return
    }
    setConfirmingDeleteId(passkeyId)
  }

  async function handleRemove(passkeyId: string, reAuthToken?: string) {
    setLoading(true)
    try {
      await deletePasskey(passkeyId, reAuthToken)
      removePasskeyLocally(passkeyId)
      setConfirmingDeleteId(null)
      onSuccess(t('extracted.my.passkeyManager.passkeyRemoved_11097d9d'))
    } catch (error) {
      if (error instanceof ApiError && error.code === 'MFA_REAUTH_REQUIRED') {
        // Server says this is the last MFA method (mfaStatus may have been stale)
        pendingDeleteIdRef.current = passkeyId
        setConfirmingDeleteId(null)
        setReauthDialogOpen(true)
      } else {
        onError(error, {
          fallback: t('extracted.my.passkeyManager.failedToRemovePasskey_5c94cb38'),
          tags: { form: 'my-passkey' },
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
    passkeys,
    pagination,
    step,
    newName,
    renamingId,
    renameName,
    loading,
    confirmingDeleteId,
    reauthDialogOpen,
    setStep,
    setNewName,
    setRenamingId,
    setRenameName,
    setConfirmingDeleteId,
    handleAddPasskey,
    handleRename,
    handleRemoveClick,
    handleRemove,
    handleRemoveWithReauth,
    handleCloseReauthDialog,
  }
}
