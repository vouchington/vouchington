'use client'

import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTheme } from '@/lib/preferences/use-theme'
import { useListStyle } from '@/lib/preferences/use-list-style'
import { useFeedStyle } from '@/lib/preferences/use-feed-style'
import { isValidTheme, isValidListStyle, isValidFeedStyle } from '@/lib/preferences/shared'
import { useTranslations } from '@/lib/i18n/use-translations'
import { HnDiscussionsPreference } from './hn-discussions-preference'

export function PreferencesForm({
  hnDiscussionsEnabled,
  userId,
}: {
  hnDiscussionsEnabled: boolean
  userId: string
}) {
  const t = useTranslations()
  const { theme, setTheme } = useTheme()
  const { listStyle, setListStyle } = useListStyle()
  const { feedStyle, setFeedStyle } = useFeedStyle()

  function handleThemeChange(value: string) {
    if (!isValidTheme(value) || value === theme) return
    setTheme(value)
    toast.success(t('extracted.my.preferencesForm.themeUpdated_d748d859'))
  }

  function handleListStyleChange(value: string) {
    if (!isValidListStyle(value) || value === listStyle) return
    setListStyle(value)
    toast.success(t('extracted.my.preferencesForm.listStyleUpdated_e70e3cc1'))
  }

  function handleFeedStyleChange(value: string) {
    if (!isValidFeedStyle(value) || value === feedStyle) return
    setFeedStyle(value)
    toast.success(t('extracted.my.preferencesForm.feedStyleUpdated_89fb882c'))
  }

  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor='theme'>{t('extracted.my.preferencesForm.theme_efb52e71')}</Label>
        <Select
          value={theme}
          onValueChange={handleThemeChange}
        >
          <SelectTrigger
            id='theme'
            className='w-48'
            data-pw='preferences-theme-trigger'
          >
            <SelectValue placeholder={t('extracted.my.preferencesForm.selectTheme_ee67d2ab')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value='light'
              data-pw='preferences-theme-option-light'
            >
              {t('extracted.my.preferencesForm.light_dbcd5e7b')}
            </SelectItem>
            <SelectItem
              value='dark'
              data-pw='preferences-theme-option-dark'
            >
              {t('extracted.my.preferencesForm.dark_60acc53f')}
            </SelectItem>
            <SelectItem value='system'>
              {t('extracted.my.preferencesForm.system_6725e7bb')}
            </SelectItem>
          </SelectContent>
        </Select>
        <p className='text-xs text-muted-foreground'>
          {t('extracted.my.preferencesForm.chooseBetweenLightDarkOrYour_0d8c5266')}
        </p>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='list-style'>
          {t('extracted.my.preferencesForm.postListStyle_9f399876')}
        </Label>
        <Select
          value={listStyle}
          onValueChange={handleListStyleChange}
        >
          <SelectTrigger
            id='list-style'
            className='w-48'
            data-pw='preferences-list-style-trigger'
          >
            <SelectValue placeholder={t('extracted.my.preferencesForm.selectListStyle_7d9b212b')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='card'>{t('extracted.my.preferencesForm.card_be3702e3')}</SelectItem>
            <SelectItem
              value='compact'
              data-pw='preferences-list-style-option-compact'
            >
              {t('extracted.my.preferencesForm.compact_99452646')}
            </SelectItem>
          </SelectContent>
        </Select>
        <p className='text-xs text-muted-foreground'>
          {t('extracted.my.preferencesForm.cardShowsMoreDetailCompactShows_5afe4d4d')}
        </p>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='feed-style'>{t('extracted.my.preferencesForm.feedStyle_225fff4c')}</Label>
        <Select
          value={feedStyle}
          onValueChange={handleFeedStyleChange}
        >
          <SelectTrigger
            id='feed-style'
            className='w-48'
          >
            <SelectValue placeholder={t('extracted.my.preferencesForm.selectFeedStyle_6696bbf8')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='compact'>
              {t('extracted.my.preferencesForm.compact_99452646')}
            </SelectItem>
            <SelectItem value='summary'>
              {t('extracted.my.preferencesForm.summary_8e76a94a')}
            </SelectItem>
          </SelectContent>
        </Select>
        <p className='text-xs text-muted-foreground'>
          {t('extracted.my.preferencesForm.summaryIncludesAShortExcerptFrom_495436fb')}
        </p>
      </div>

      <HnDiscussionsPreference
        initialEnabled={hnDiscussionsEnabled}
        userId={userId}
      />
    </div>
  )
}
