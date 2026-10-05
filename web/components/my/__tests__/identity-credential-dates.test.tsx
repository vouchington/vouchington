import { render, screen } from '@testing-library/react'
import { createTranslator } from '@ts-shared/ui-messages'
import { formatUtcDate } from '@ts-shared/utils/format'
import { beforeAll, describe, expect, it } from 'vitest'
import { PasskeyList } from '@/components/my/passkey-manager/passkey-list'
import { AuthenticatorList } from '@/components/my/totp-manager/authenticator-list'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { seedMessages } from '@/lib/i18n/use-translations'
import { UiLocaleContext } from '@/lib/i18n/ui-locale-context'
import type { Passkey, TotpAuthenticator } from '@/types/user'

const createdAt = '2025-01-15T10:00:00.000Z'
const lastUsedAt = '2025-03-02T18:00:00.000Z'
const uiLocales = ['es', 'fr', 'pt'] as const
const addedDateKey = 'extracted.passkeyManager.passkeyList.addedDate_e7bbba62' as const
const lastUsedDateKey = 'extracted.passkeyManager.passkeyList.lastUsedDate_01c03319' as const
const authenticatorAddedDateKey =
  'extracted.totpManager.authenticatorList.addedDate_e7bbba62' as const

const passkey: Passkey = {
  id: 'pk-1',
  name: 'Laptop',
  device_type: 'multiDevice',
  is_backed_up: true,
  created_at: createdAt,
  last_used_at: lastUsedAt,
}

const authenticator: TotpAuthenticator = {
  id: 'totp-1',
  name: 'Phone',
  created_at: createdAt,
}

function noop() {}

describe('identity credential dates', () => {
  const catalogs = new Map<string, Awaited<ReturnType<typeof loadJsonMessages>>>()

  beforeAll(async () => {
    for (const locale of uiLocales) {
      const messages = await loadJsonMessages(locale)
      catalogs.set(locale, messages)
      seedMessages(locale, messages)
    }
  })

  it.each(uiLocales)('formats passkey added and last-used dates in the %s UI locale', locale => {
    const messages = catalogs.get(locale)
    if (messages === undefined) throw new Error(`missing ${locale} catalog`)
    const translate = createTranslator(locale, messages)
    const added = formatUtcDate(createdAt, locale)
    const lastUsed = formatUtcDate(lastUsedAt, locale)
    expect(added).not.toBe(formatUtcDate(createdAt))
    expect(lastUsed).not.toBe(formatUtcDate(lastUsedAt))

    render(
      <UiLocaleContext.Provider value={locale}>
        <PasskeyList
          confirmingDeleteId={null}
          loading={false}
          passkeys={[passkey]}
          renameName=''
          renamingId={null}
          onConfirmRemove={noop}
          onRemoveClick={noop}
          onRename={noop}
          setConfirmingDeleteId={noop}
          setRenameName={noop}
          setRenamingId={noop}
        />
      </UiLocaleContext.Provider>,
    )

    expect(
      screen.getByText(
        `${translate(addedDateKey, { date: added })} · ${translate(lastUsedDateKey, { date: lastUsed })}`,
      ),
    ).toBeInTheDocument()
  })

  it.each(uiLocales)('formats authenticator added dates in the %s UI locale', locale => {
    const messages = catalogs.get(locale)
    if (messages === undefined) throw new Error(`missing ${locale} catalog`)
    const translate = createTranslator(locale, messages)
    const added = formatUtcDate(createdAt, locale)
    expect(added).not.toBe(formatUtcDate(createdAt))

    render(
      <UiLocaleContext.Provider value={locale}>
        <AuthenticatorList
          authenticators={[authenticator]}
          confirmingDeleteId={null}
          loading={false}
          renameName=''
          renamingId={null}
          onConfirmRemove={noop}
          onRemoveClick={noop}
          onRename={noop}
          setConfirmingDeleteId={noop}
          setRenameName={noop}
          setRenamingId={noop}
        />
      </UiLocaleContext.Provider>,
    )

    expect(
      screen.getByText(translate(authenticatorAddedDateKey, { date: added })),
    ).toBeInTheDocument()
  })
})
