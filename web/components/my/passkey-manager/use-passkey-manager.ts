'use client'

import { useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { startRegistration, type StartRegistrationOpts } from '@simplewebauthn/browser'
import {
  deletePasskey,
  getPasskeyRegistrationOptions,
  renamePasskey,
  verifyPasskeyRegistration,
} from '@/lib/api/client'
import { useFreshAuthentication } from '../use-fresh-authentication'
import type { ListResponse } from '@/types/api-responses'
import type { MfaStatus, Passkey } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'
import { usePasskeyPagination } from './use-passkey-pagination'

type Step = 'list' | 'add'

export function usePasskeyManager(initialData: ListResponse<Passkey>, mfaStatus: MfaStatus) {
  const t = useTranslations()
  const { passkeys, pagination, addPasskey, renamePasskeyLocally, removePasskeyLocally } =
    usePasskeyPagination(initialData)
  const [step, setStep] = useState<Step>('list')
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const authentication = useFreshAuthentication(mfaStatus)
  const reauthDialogOpen = authentication.dialogProps.open

  async function handleAddPasskey(e: React.FormEvent) {
    e.preventDefault()
    const reAuthToken = await authentication.requestAuthentication()
    if (!reAuthToken) return
    setLoading(true)
    try {
      interface RegOptionsResponse {
        options: StartRegistrationOpts['optionsJSON']
      }
      const { options } = await getPasskeyRegistrationOptions<RegOptionsResponse>()

      const registrationResponse = await startRegistration({ optionsJSON: options })

      const { passkey } = await verifyPasskeyRegistration<{ passkey: Passkey }>({
        response: registrationResponse,
        re_auth_token: reAuthToken,
        name: newName.trim() || t('extracted.my.passkeyManager.myPasskey_e8f5c02d'),
      })

      addPasskey(passkey)
      setStep('list')
      setNewName('')
      onSuccess(t('extracted.my.passkeyManager.passkeyAddedSuccessfully_6cfc7389'))
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        onError(err, {
          fallback: t('extracted.my.passkeyManager.passkeyRegistrationWasCancelled_230bcff5'),
          tags: { form: 'my-passkey' },
          skipSentry: true,
        })
      } else {
        onError(err, {
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
    } catch (err) {
      onError(err, {
        fallback: t('extracted.my.passkeyManager.failedToRenamePasskey_bfdf3db4'),
        tags: { form: 'my-passkey' },
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(passkeyId: string) {
    const reAuthToken = await authentication.requestAuthentication()
    if (!reAuthToken) return
    setLoading(true)
    try {
      await deletePasskey(passkeyId, reAuthToken)
      removePasskeyLocally(passkeyId)
      setConfirmingDeleteId(null)
      onSuccess(t('extracted.my.passkeyManager.passkeyRemoved_11097d9d'))
    } catch (err) {
      onError(err, {
        fallback: t('extracted.my.passkeyManager.failedToRemovePasskey_5c94cb38'),
        tags: { form: 'my-passkey' },
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveWithReauth = authentication.dialogProps.onVerified
  const handleCloseReauthDialog = authentication.dialogProps.onClose

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
    handleRemoveClick: setConfirmingDeleteId,
    handleRemove,
    handleRemoveWithReauth,
    handleCloseReauthDialog,
  }
}
