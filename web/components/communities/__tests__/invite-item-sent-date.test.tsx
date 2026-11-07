import { makeCommunityInvite } from '@/test-helpers/api-responses/communities'
import { render, screen } from '@testing-library/react'
import { createTranslator } from '@ts-shared/ui-messages'
import { formatUtcDate } from '@ts-shared/utils/format'
import { beforeAll, describe, expect, it } from 'vitest'
import { InviteItem } from '../invite-item'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { mergeMessages } from '@/lib/i18n/use-translations'
import { LocaleProvider } from '@/lib/i18n/ui-locale-context'

const createdAt = '2026-01-15T00:30:00.000Z'
const uiLocales = ['es', 'fr', 'pt'] as const
const sentDateKey = 'extracted.communities.inviteItem.sentDate' as const

function noop() {}

describe('InviteItem sent date', () => {
  const catalogs = new Map<string, Awaited<ReturnType<typeof loadJsonMessages>>>()

  beforeAll(async () => {
    for (const locale of uiLocales) {
      const messages = await loadJsonMessages(locale)
      catalogs.set(locale, messages)
      mergeMessages(locale, messages)
    }
  })

  it.each(uiLocales)('formats the sent date in the %s UI locale', locale => {
    const messages = catalogs.get(locale)
    if (messages === undefined) throw new Error(`missing ${locale} catalog`)
    const translate = createTranslator(locale, messages)
    const sentDate = formatUtcDate(createdAt, locale)
    expect(sentDate).not.toBe(formatUtcDate(createdAt))

    render(
      <LocaleProvider locale={locale}>
        <InviteItem
          invite={makeCommunityInvite({ created_at: createdAt })}
          loading={false}
          onRevoke={noop}
        />
      </LocaleProvider>,
    )

    expect(screen.getByText(translate(sentDateKey, { sentDate }))).toBeInTheDocument()
  })
})
