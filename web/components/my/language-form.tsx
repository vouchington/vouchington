'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateMyUser } from '@/lib/api/client/users'
import onError, { onSuccess } from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'
import { COUNTRY_SELECT_OPTIONS } from '@ts-shared/languages/select-options'
import { DEFAULT_UI_LOCALE, UI_LOCALE_SELECT_OPTIONS } from '@ts-shared/languages/ui-locales'

// Radix Select reserves '' for clearing — use a sentinel that maps to null in the API call
const SITE_DEFAULT = 'site-default'
const NO_COUNTRY = 'no-country'

export interface LanguageFormInitialUser {
  id: string
  country: string | null
  uiLocale: string | null
}

export function LanguageForm({ initialUser }: { initialUser: LanguageFormInitialUser }) {
  const t = useTranslations()
  const [pending, setPending] = useState(false)
  const [optimisticCountry, setOptimisticCountry] = useState<string | null>(null)
  const [optimisticUiLocale, setOptimisticUiLocale] = useState<string | null>(null)

  const currentUserId = initialUser.id
  const country = optimisticCountry ?? initialUser.country ?? NO_COUNTRY
  const uiLocale = optimisticUiLocale ?? initialUser.uiLocale ?? SITE_DEFAULT
  const effectiveUiLocale = uiLocale === SITE_DEFAULT ? DEFAULT_UI_LOCALE : uiLocale
  const currentLocaleOption = UI_LOCALE_SELECT_OPTIONS.find(
    option => option.value === effectiveUiLocale,
  )
  /* c8 ignore next -- SUPPORTED_UI_LOCALES always includes the effective UI locale today */
  const currentLocaleLabel = currentLocaleOption?.label ?? effectiveUiLocale

  async function handleCountryChange(value: string) {
    const newCountry = value === NO_COUNTRY ? null : value
    const previousValue = optimisticCountry
    setOptimisticCountry(value)
    setPending(true)
    try {
      await updateMyUser(currentUserId, { country: newCountry })
      onSuccess(t('settings.language.countrySaveSuccess'))
    } catch (error) {
      setOptimisticCountry(previousValue)
      /* c8 ignore next -- error path requires injecting a save country failure */
      onError(error, { fallback: t('settings.language.countrySaveError') })
    } finally {
      setPending(false)
    }
  }

  async function handleUiLocaleChange(value: string) {
    const newUiLocale = value === SITE_DEFAULT ? null : value
    const previousValue = optimisticUiLocale
    setOptimisticUiLocale(value)
    setPending(true)
    try {
      await updateMyUser(currentUserId, { ui_locale: newUiLocale })
      onSuccess(t('settings.language.saveSuccess'))
    } catch (error) {
      setOptimisticUiLocale(previousValue)
      onError(error, { fallback: t('settings.language.saveError') })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor='preferred-country'>{t('settings.language.countryLabel')}</Label>
        <Select
          value={country}
          onValueChange={handleCountryChange}
          disabled={pending}
        >
          <SelectTrigger
            id='preferred-country'
            className='w-64'
          >
            <SelectValue placeholder={t('settings.language.noCountryPreference')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_COUNTRY}>{t('settings.language.noCountryPreference')}</SelectItem>
            {COUNTRY_SELECT_OPTIONS.map(option => (
              <SelectItem
                key={option.value}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='space-y-2'>
        <Label htmlFor='preferred-ui-locale'>{t('settings.language.interfaceLabel')}</Label>
        <Select
          value={uiLocale}
          onValueChange={handleUiLocaleChange}
          disabled={pending}
        >
          <SelectTrigger
            id='preferred-ui-locale'
            className='w-72'
          >
            <SelectValue placeholder={t('settings.language.useSiteDefault')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SITE_DEFAULT}>
              {t('settings.language.useSiteDefault')} ({DEFAULT_UI_LOCALE})
            </SelectItem>
            {UI_LOCALE_SELECT_OPTIONS.map(option => (
              <SelectItem
                key={option.value}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className='text-xs text-muted-foreground'>{t('settings.language.description')}</p>
        <p className='text-xs text-muted-foreground'>
          {t('settings.language.currentLabel', { language: currentLocaleLabel })} ·{' '}
          {t('settings.language.supportedCount', { count: UI_LOCALE_SELECT_OPTIONS.length })}
        </p>
      </div>
    </div>
  )
}
