import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { ImportExportManager } from '@/components/my/import-export/import-export-manager'
import type { RssFeedContentType } from '@/lib/api/client/import-export'

interface Props {
  title: string
  description: string
  feedType: RssFeedContentType | 'topics' | 'all'
}

export function ImportExportPage({ title, description, feedType }: Props) {
  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={title}
        description={description}
      />
      <ImportExportManager feedType={feedType} />
    </div>
  )
}
