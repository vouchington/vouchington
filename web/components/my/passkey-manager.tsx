'use client'

import { Button } from '@/components/ui/button'
import { MfaReauthDialog } from '@/components/my/mfa-reauth-dialog'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import type { ListResponse } from '@/types/api-responses'
import type { MfaStatus, Passkey } from '@/types/user'
import { AddPasskeyForm } from './passkey-manager/add-passkey-form'
import { PasskeyList } from './passkey-manager/passkey-list'
import { usePasskeyManager } from './passkey-manager/use-passkey-manager'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  initialData: ListResponse<Passkey>
  mfaStatus: MfaStatus
}

export function PasskeyManager({ initialData, mfaStatus }: Props) {
  const t = useTranslations()
  const passkey = usePasskeyManager(initialData, mfaStatus)
  const handleLoadMore = passkey.pagination.loadMore

  return (
    <div className='space-y-4'>
      <h2
        className='text-lg font-semibold'
        data-pw='passkeys-heading'
      >
        {t('extracted.my.passkeyManager.passkeys_c87ccdb4')}
      </h2>
      <p className='text-sm text-muted-foreground'>
        {t('extracted.my.passkeyManager.passkeysLetYouSignInSecurely_961cef6e')}
      </p>

      <InfiniteScroll
        hasNextPage={passkey.pagination.hasNextPage}
        endCursor={passkey.pagination.endCursor}
        onLoadMore={handleLoadMore}
        loadingMore={passkey.pagination.loadingMore}
        fetchError={passkey.pagination.fetchError}
        clearError={passkey.pagination.clearError}
        resetKey={passkey.pagination.resetKey}
      >
        <PasskeyList
          confirmingDeleteId={passkey.confirmingDeleteId}
          loading={passkey.loading}
          passkeys={passkey.passkeys}
          renameName={passkey.renameName}
          renamingId={passkey.renamingId}
          onConfirmRemove={passkey.handleRemove}
          onRemoveClick={passkey.handleRemoveClick}
          onRename={passkey.handleRename}
          setConfirmingDeleteId={passkey.setConfirmingDeleteId}
          setRenameName={passkey.setRenameName}
          setRenamingId={passkey.setRenamingId}
        />
      </InfiniteScroll>

      {passkey.step === 'list' && (
        <Button
          variant='outline'
          onClick={() => passkey.setStep('add')}
          data-pw='add-passkey-button'
        >
          {t('extracted.my.passkeyManager.addPasskey_ffc92f64')}
        </Button>
      )}

      {passkey.step === 'add' && (
        <AddPasskeyForm
          loading={passkey.loading}
          newName={passkey.newName}
          onAddPasskey={passkey.handleAddPasskey}
          setNewName={passkey.setNewName}
          setStep={passkey.setStep}
        />
      )}

      <MfaReauthDialog
        open={passkey.reauthDialogOpen}
        mfaStatus={mfaStatus}
        onVerified={passkey.handleRemoveWithReauth}
        onClose={passkey.handleCloseReauthDialog}
      />
    </div>
  )
}
