'use client'

import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useTranslations } from '@/lib/i18n/use-translations'

export function AddAliasesForm({
  onSubmit,
  adding,
  mounted,
}: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  adding: boolean
  mounted: boolean
}) {
  const t = useTranslations()
  return (
    <section className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'>
      <h2
        data-pw='add-aliases-heading'
        className='mb-4 text-xl font-semibold text-foreground'
      >
        {t('extracted.aliases.aliasesClient.addAliases_5203d9af')}
      </h2>
      <form
        onSubmit={onSubmit}
        className='space-y-4'
      >
        <div>
          <Label htmlFor='aliases'>
            {t('extracted.aliases.aliasesClient.aliasesCommaSemicolonOrNewlineSeparated_4e4a4669')}
          </Label>
          <Textarea
            id='aliases'
            name='aliases'
            data-pw='aliases-input'
            rows={4}
            required
            placeholder={t('extracted.aliases.aliasesClient.alias1Alias2Alias3_30258055')}
            className='mt-1'
          />
        </div>
        <Button
          type='submit'
          data-pw='add-aliases-submit'
          loading={adding}
          disabled={!mounted || adding}
        >
          {adding
            ? t('extracted.aliases.aliasesClient.adding_913a8849')
            : t('extracted.aliases.aliasesClient.addAliases_5203d9af')}
        </Button>
      </form>
    </section>
  )
}
