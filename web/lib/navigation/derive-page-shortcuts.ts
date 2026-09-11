import type { MessageKey } from '@ts-shared/ui-messages'
import { NAV_INTENTS, type NavIntentId } from './intents'

const PALETTE_ONLY_INTENT_FEATURE_FLAGS: Partial<Record<NavIntentId, string>> = {
  chat: 'chat',
}

type ShortcutBucket = 'public' | 'authenticated' | 'admin'

export type DerivedPageShortcut = {
  label: MessageKey
  href: string
  dataPw: string
  bucket: ShortcutBucket
  featureFlag?: string
}

export function hrefToDataPw(href: string): string {
  return `search-page-shortcut-${href.replace(/^\//, '').replace(/\//g, '-')}`
}

function deriveShortcuts(): DerivedPageShortcut[] {
  const seen = new Map<string, DerivedPageShortcut>()

  for (const intent of NAV_INTENTS) {
    const featureFlag = intent.featureFlag ?? PALETTE_ONLY_INTENT_FEATURE_FLAGS[intent.id]

    for (const group of intent.groups) {
      const roleGated = !!(intent.roles?.length || group.roles?.length)
      const requiresAuth = !!(intent.requiresAuth || group.requiresAuth)

      const bucket: ShortcutBucket = roleGated ? 'admin' : requiresAuth ? 'authenticated' : 'public'

      for (const item of group.items) {
        if (item.comingSoon) continue

        const effectiveBucket: ShortcutBucket =
          item.requiresAuth && bucket === 'public' ? 'authenticated' : bucket

        if (seen.has(item.href)) continue

        const shortcut: DerivedPageShortcut = {
          label: item.label,
          href: item.href,
          dataPw: hrefToDataPw(item.href),
          bucket: effectiveBucket,
          ...(featureFlag ? { featureFlag } : {}),
        }
        seen.set(item.href, shortcut)
      }
    }
  }

  return [...seen.values()]
}

// Pages that appear in the Cmd+K palette but have no sidebar entry.
// All are public and have no feature-flag gate.
const SUPPLEMENTAL_PAGE_SHORTCUTS: DerivedPageShortcut[] = [
  {
    label: 'extracted.navigation.derivePageShortcuts.plans_dfe8b2f0',
    href: '/plans',
    dataPw: hrefToDataPw('/plans'),
    bucket: 'public',
  },
  {
    label: 'extracted.navigation.derivePageShortcuts.keyboardShortcuts_59cdaa26',
    href: '/article/keyboard-shortcuts',
    dataPw: hrefToDataPw('/article/keyboard-shortcuts'),
    bucket: 'public',
  },
  {
    label: 'extracted.navigation.derivePageShortcuts.submitALink_633b60d7',
    href: '/links/create',
    dataPw: hrefToDataPw('/links/create'),
    bucket: 'authenticated' as ShortcutBucket,
  },
  {
    label: 'extracted.navigation.derivePageShortcuts.dismissedRecommendations_026f0a1b',
    href: '/my/topics/dismissed-recommendations',
    dataPw: hrefToDataPw('/my/topics/dismissed-recommendations'),
    bucket: 'authenticated' as ShortcutBucket,
  },
  {
    label: 'extracted.navigation.derivePageShortcuts.newMessage_8e51a80a',
    href: '/messages/new',
    dataPw: hrefToDataPw('/messages/new'),
    bucket: 'authenticated' as ShortcutBucket,
  },
  {
    label: 'extracted.navigation.derivePageShortcuts.crawlers_9bb7d6d4',
    href: '/crawlers',
    dataPw: hrefToDataPw('/crawlers'),
    bucket: 'admin',
  },
  {
    label: 'extracted.flags.integrityPenalties.reportTitle_6f7f2d01',
    href: '/report-integrity/penalties',
    dataPw: hrefToDataPw('/report-integrity/penalties'),
    bucket: 'admin',
  },
  {
    label: 'extracted.flags.integrityPenalties.voteTitle_3a621e8c',
    href: '/vote-integrity/penalties',
    dataPw: hrefToDataPw('/vote-integrity/penalties'),
    bucket: 'admin',
  },
]

const derived = deriveShortcuts()

// Merge: derived first, supplemental only for hrefs not already in derived.
const supplementalNew = SUPPLEMENTAL_PAGE_SHORTCUTS.filter(
  s => !derived.some(d => d.href === s.href),
)

export const DERIVED_PAGE_SHORTCUTS: readonly DerivedPageShortcut[] = [
  ...derived,
  ...supplementalNew,
]
