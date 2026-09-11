'use client'

import { Button } from '@/components/ui/button'
import { ActiveApiKeysList, RevokedApiKeysList } from './api-keys-manager/api-key-lists'
import { CreateApiKeyForm } from './api-keys-manager/create-api-key-form'
import { KeyCreatedAlert } from './api-keys-manager/key-created-alert'
import {
  DEFAULT_API_KEY_PRESET_ID,
  getVisibleApiKeyPresets,
} from './api-keys-manager/api-key-presets'
import { useApiKeysManager } from './api-keys-manager/use-api-keys-manager'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ListResponse } from '@/types/api-responses'
import type { ApiKey } from '@/types/api-keys'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'

export function ApiKeysManager({ initialData }: { initialData?: ListResponse<ApiKey> }) {
  const t = useTranslations()
  const {
    isAdmin,
    keys,
    loading,
    loadError,
    creating,
    setCreating,
    newLabel,
    setNewLabel,
    selectedPresetId,
    setSelectedPresetId,
    submitting,
    newRawKey,
    setNewRawKey,
    copied,
    confirmingRevokeId,
    setConfirmingRevokeId,
    revokingIds,
    handleCreate,
    handleRevoke,
    handleCopy,
    pagination,
  } = useApiKeysManager(initialData)
  const handleLoadMore = pagination.loadMore

  const activeKeys = keys.filter(k => !k.revoked_at)
  const revokedKeys = keys.filter(k => k.revoked_at)

  return (
    <div className='space-y-4'>
      {newRawKey && (
        <KeyCreatedAlert
          copied={copied}
          rawKey={newRawKey}
          onCopy={handleCopy}
          onDismiss={() => setNewRawKey(null)}
        />
      )}

      <div className='rounded-md border bg-muted/50 p-4'>
        <p
          className='text-sm text-muted-foreground'
          data-pw='api-keys-example-rss'
        >
          {t('extracted.my.apiKeysManager.exampleRssUrlWithApiKey_12d7ee74')}{' '}
          <code className='rounded bg-muted px-1 py-0.5 font-mono text-xs'>
            {t('extracted.my.apiKeysManager.rssPostsTopicsExampleApikeyYour_0742d9e9')}
          </code>
        </p>
      </div>

      {loading ? (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.my.apiKeysManager.loading_47d2a515')}
        </p>
      ) : (
        <>
          <InfiniteScroll
            hasNextPage={pagination.hasNextPage}
            endCursor={pagination.endCursor}
            onLoadMore={handleLoadMore}
            loadingMore={pagination.loadingMore}
            fetchError={pagination.fetchError}
            clearError={pagination.clearError}
            resetKey={pagination.resetKey}
          >
            <ActiveApiKeysList
              confirmingRevokeId={confirmingRevokeId}
              keys={activeKeys}
              revokingIds={revokingIds}
              onCancelRevoke={() => setConfirmingRevokeId(null)}
              onConfirmRevoke={handleRevoke}
              onStartRevoke={setConfirmingRevokeId}
            />
          </InfiniteScroll>

          {activeKeys.length === 0 && !creating && !loadError && (
            <p className='text-sm text-muted-foreground'>
              {t('extracted.my.apiKeysManager.noActiveApiKeys_de64e83d')}
            </p>
          )}

          {loadError && (
            <p className='text-sm text-destructive'>
              {t('extracted.my.apiKeysManager.failedToLoadApiKeysPlease_27bebc7a')}
            </p>
          )}

          {creating ? (
            <CreateApiKeyForm
              label={newLabel}
              submitting={submitting}
              presets={getVisibleApiKeyPresets(isAdmin)}
              selectedPresetId={selectedPresetId}
              onCancel={() => {
                setCreating(false)
                setNewLabel('')
                setSelectedPresetId(DEFAULT_API_KEY_PRESET_ID)
              }}
              onCreate={handleCreate}
              setLabel={setNewLabel}
              setSelectedPresetId={setSelectedPresetId}
            />
          ) : (
            <Button
              variant='outline'
              onClick={() => setCreating(true)}
              data-pw='api-keys-create-button'
            >
              {t('extracted.my.apiKeysManager.createApiKey_e133f431')}
            </Button>
          )}

          <RevokedApiKeysList keys={revokedKeys} />
        </>
      )}
    </div>
  )
}
