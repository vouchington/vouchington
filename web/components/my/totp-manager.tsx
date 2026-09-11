'use client'

import { Button } from '@/components/ui/button'
import { MfaReauthDialog } from '@/components/my/mfa-reauth-dialog'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import type { ListResponse } from '@/types/api-responses'
import type { MfaStatus, TotpAuthenticator } from '@/types/user'
import { AuthenticatorList } from './totp-manager/authenticator-list'
import { TotpSetupFlow } from './totp-manager/setup-flow'
import { useTotpManager } from './totp-manager/use-totp-manager'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  initialData: ListResponse<TotpAuthenticator>
  mfaStatus: MfaStatus
}

export function TotpManager({ initialData, mfaStatus }: Props) {
  const t = useTranslations()
  const totp = useTotpManager(initialData, mfaStatus)
  const handleLoadMore = totp.pagination.loadMore

  return (
    <div className='space-y-4'>
      <h2
        className='text-lg font-semibold'
        data-pw='totp-manager-heading'
      >
        {t('extracted.my.totpManager.authenticatorApps_f06f5e1d')}
      </h2>
      <p className='text-sm text-muted-foreground'>
        {t('extracted.my.totpManager.useAnAuthenticatorAppToGenerate_99ff07ea')}
      </p>
      <InfiniteScroll
        hasNextPage={totp.pagination.hasNextPage}
        endCursor={totp.pagination.endCursor}
        onLoadMore={handleLoadMore}
        loadingMore={totp.pagination.loadingMore}
        fetchError={totp.pagination.fetchError}
        clearError={totp.pagination.clearError}
        resetKey={totp.pagination.resetKey}
      >
        <AuthenticatorList
          authenticators={totp.authenticators}
          confirmingDeleteId={totp.confirmingDeleteId}
          loading={totp.loading}
          renameName={totp.renameName}
          renamingId={totp.renamingId}
          onConfirmRemove={totp.handleRemove}
          onRemoveClick={totp.handleRemoveClick}
          onRename={totp.handleRename}
          setConfirmingDeleteId={totp.setConfirmingDeleteId}
          setRenameName={totp.setRenameName}
          setRenamingId={totp.setRenamingId}
        />
      </InfiniteScroll>

      {totp.step === 'list' && (
        <Button
          variant='outline'
          onClick={() => totp.setStep('setup')}
          data-pw='totp-add-authenticator-button'
        >
          {t('extracted.my.totpManager.addAuthenticator_5e75b362')}
        </Button>
      )}

      {totp.step === 'setup' && (
        <TotpSetupFlow
          loading={totp.loading}
          setupCode={totp.setupCode}
          setupData={totp.setupData}
          setupName={totp.setupName}
          onStartSetup={totp.handleStartSetup}
          onVerifySetup={totp.handleVerifySetup}
          setSetupCode={totp.setSetupCode}
          setSetupData={totp.setSetupData}
          setSetupName={totp.setSetupName}
          setStep={totp.setStep}
        />
      )}

      <MfaReauthDialog
        open={totp.reauthDialogOpen}
        mfaStatus={mfaStatus}
        onVerified={totp.handleRemoveWithReauth}
        onClose={totp.handleCloseReauthDialog}
      />
    </div>
  )
}
