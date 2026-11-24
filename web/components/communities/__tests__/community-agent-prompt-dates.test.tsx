import { render, screen } from '@testing-library/react'
import { formatUtcDateTime } from '@ts-shared/utils/format'
import { beforeAll, describe, expect, it } from 'vitest'
import type {
  CommunityAgentPrompt,
  CommunityAgentPromptHistoryEntry,
} from '@/lib/api/client/community-agent-prompts'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { LocaleProvider } from '@/lib/i18n/ui-locale-context'
import { mergeMessages } from '@/lib/i18n/use-translations'
import { CommunityAgentPromptHistory } from '../community-agent-prompt-history'
import { CommunityAgentPromptStatus } from '../community-agent-prompt-status'

const timestamp = '2026-01-15T23:30:00.000Z'
const uiLocales = ['es', 'fr', 'pt'] as const

describe('community agent prompt dates', () => {
  beforeAll(async () => {
    for (const locale of uiLocales) mergeMessages(locale, await loadJsonMessages(locale))
  })

  it.each(uiLocales)('formats status dates in the %s UI locale', locale => {
    const expected = formatUtcDateTime(timestamp, locale)
    expect(expected).not.toBe(formatUtcDateTime(timestamp, 'en'))

    render(
      <LocaleProvider locale={locale}>
        <CommunityAgentPromptStatus
          prompt={
            {
              is_slot_allocated: true,
              activated_at: timestamp,
              deactivated_at: timestamp,
            } as CommunityAgentPrompt
          }
        />
      </LocaleProvider>,
    )

    expect(screen.getAllByText(expected)).toHaveLength(2)
  })

  it.each(uiLocales)('formats history entry dates in the %s UI locale', locale => {
    const expected = formatUtcDateTime(timestamp, locale)
    const entry = {
      id: 'entry-1',
      action: 'created',
      changed_by: { id: 'u-1', username: 'alice' },
      previous_fields: {},
      next_fields: { prompt: 'Hello' },
      changed_fields: {},
      created_at: timestamp,
    } as CommunityAgentPromptHistoryEntry

    render(
      <LocaleProvider locale={locale}>
        <CommunityAgentPromptHistory
          initialEntries={[entry]}
          initialNextCursor={null}
          communitySlug='credit-cards'
        />
      </LocaleProvider>,
    )

    expect(screen.getByText(expected)).toBeInTheDocument()
  })
})
