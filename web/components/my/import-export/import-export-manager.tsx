'use client'

import { useState, useReducer } from 'react'
import { Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ButtonGroup } from '@/components/ui/button-group'
import type { RssFeedContentType } from '@/lib/api/client/import-export'
import { ImportProgressBar } from './import-progress-bar'
import { initialState, reducer } from './import-export-state'
import { SourceFileInput } from './source-file-input'
import { useImportExportActions } from './use-import-export-actions'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  feedType: RssFeedContentType | 'topics' | 'all'
}

export function ImportExportManager({ feedType }: Props) {
  const t = useTranslations()
  const [state, dispatch] = useReducer(reducer, initialState)
  const isTopics = feedType === 'topics'
  const [selectedType, setSelectedType] = useState<RssFeedContentType | 'all'>(
    isTopics ? 'all' : feedType,
  )
  const { handleExport, handleImport, handleImportFile } = useImportExportActions({
    isTopics,
    selectedType,
    state,
    dispatch,
  })

  const exporting = isTopics ? state.exportingTopics : state.exportingFeeds
  const progress = state.importProgress

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>{t('extracted.importExport.importExportManager.export_36648955')}</CardTitle>
          <CardDescription>
            {isTopics
              ? t('extracted.importExport.importExportManager.downloadYourFollowedTopics_427f1e08')
              : t(
                  'extracted.importExport.importExportManager.downloadYourFollowedSources_ec1ac9f2',
                )}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-wrap gap-3'>
          {isTopics ? (
            <Button
              variant='outline'
              onClick={() => handleExport('opml')}
              loading={exporting}
              disabled={exporting}
            >
              {!exporting && <Download className='h-4 w-4' />}
              {exporting
                ? t('extracted.importExport.importExportManager.exporting_639e4536')
                : t('extracted.importExport.importExportManager.exportTopicsJson_b2223afa')}
            </Button>
          ) : (
            <>
              <Select
                value={selectedType}
                onValueChange={v => setSelectedType(v as RssFeedContentType | 'all')}
              >
                <SelectTrigger data-pw='import-export-type-select'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>
                    {t('extracted.importExport.importExportManager.allSources_b877e921')}
                  </SelectItem>
                  <SelectItem value='article'>
                    {t('extracted.importExport.importExportManager.newsSources_238ad263')}
                  </SelectItem>
                  <SelectItem value='podcast'>
                    {t('extracted.importExport.importExportManager.podcasts_6ac749b3')}
                  </SelectItem>
                  <SelectItem value='video'>
                    {t('extracted.importExport.importExportManager.channels_4c8906cf')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <ButtonGroup>
                <Button
                  variant='outline'
                  onClick={() => handleExport('opml')}
                  loading={exporting}
                  disabled={exporting}
                  data-pw='export-opml-button'
                >
                  {!exporting && <Download className='h-4 w-4' />}
                  {t('extracted.importExport.importExportManager.exportOpml_cfd0baea')}
                </Button>
                <Button
                  variant='outline'
                  onClick={() => handleExport('csv')}
                  loading={exporting}
                  disabled={exporting}
                  data-pw='export-csv-button'
                >
                  {!exporting && <Download className='h-4 w-4' />}
                  {t('extracted.importExport.importExportManager.exportCsv_91f71c14')}
                </Button>
              </ButtonGroup>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {isTopics
              ? t('extracted.importExport.importExportManager.importTopics_55c11921')
              : t('extracted.importExport.importExportManager.importSources_82c112a3')}
          </CardTitle>
          <CardDescription>
            {isTopics
              ? t('extracted.importExport.importExportManager.pasteTopicNamesOnePerLine_b5f09ce4')
              : t('extracted.importExport.importExportManager.pasteSourceUrlsOnePerLine_f2d86f1f')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Textarea
            aria-label={
              isTopics
                ? t('extracted.importExport.importExportManager.topicNamesToImport_468c96a8')
                : t('extracted.importExport.importExportManager.sourceUrlsToImport_6ccfa2d9')
            }
            placeholder={
              isTopics
                ? t(
                    'extracted.importExport.importExportManager.technologyFinanceHealthcare_f91b4f35',
                  )
                : t(
                    'extracted.importExport.importExportManager.httpsExampleComFeedXmlHttps_97cf52c2',
                  )
            }
            value={state.rssFeedUrls}
            onChange={e => dispatch({ rssFeedUrls: e.target.value })}
            rows={5}
          />
          <div className='flex flex-wrap gap-3'>
            <Button
              onClick={handleImport}
              loading={state.importingFeeds}
              disabled={state.importingFeeds}
              data-pw='import-urls-button'
            >
              {!state.importingFeeds && <Upload className='h-4 w-4' />}
              {state.importingFeeds && !progress
                ? t('extracted.importExport.importExportManager.submitting_64115d5b')
                : isTopics
                  ? t('extracted.importExport.importExportManager.importTopics_55c11921')
                  : t('extracted.importExport.importExportManager.importUrls_4d4e8026')}
            </Button>
            {!isTopics && (
              <SourceFileInput
                disabled={state.importingFeeds}
                onFile={handleImportFile}
              />
            )}
          </div>
          {progress && <ImportProgressBar progress={progress} />}
        </CardContent>
      </Card>
    </div>
  )
}
