import { ReferralLinkCard } from './referral-link-card'
import { getTranslations } from '@/lib/i18n/get-translations'
import type { MessageKey } from '@ts-shared/ui-messages'
import type {
  PrioritizedReferralLink,
  PrioritizedReferralLinksResponse,
} from '@/types/api-responses'

interface ReferralLinkListProps {
  response: PrioritizedReferralLinksResponse
}

const GROUP_LABEL_KEYS: Record<number, MessageKey> = {
  0: 'extracted.referralLinks.referralLinkList.useOurOfficialLinks_1626a49d',
  1: 'extracted.referralLinks.referralLinkList.mutualFollows_d9732bd5',
  2: 'extracted.referralLinks.referralLinkList.peopleYouFollow_13f59bd0',
  3: 'extracted.referralLinks.referralLinkList.peopleWhoReferredYou_393a6746',
  4: 'extracted.referralLinks.referralLinkList.authorsYouRatedPositively_ae49c3c5',
  5: 'extracted.referralLinks.referralLinkList.everyoneElse_919112f4',
}

function ReferralLinkGroup({
  label,
  links,
  response,
}: {
  label: string
  links: PrioritizedReferralLink[]
  response: PrioritizedReferralLinksResponse
}) {
  if (links.length === 0) return null

  return (
    <div className='space-y-2'>
      <h3 className='text-sm font-semibold text-muted-foreground'>{label}</h3>
      <div className='space-y-2'>
        {links.map(link => (
          <ReferralLinkCard
            key={link.id}
            link={link}
            user={link.user_id ? response.users[link.user_id] : undefined}
          />
        ))}
      </div>
    </div>
  )
}

export async function ReferralLinkList({ response }: ReferralLinkListProps) {
  const t = await getTranslations()

  if (response.links.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('extracted.referralLinks.referralLinkList.noReferralLinksHaveBeenAdded_3487a2e7')}
      </p>
    )
  }

  const groupedLinks = new Map<number, PrioritizedReferralLink[]>()
  for (const link of response.links) {
    const group = groupedLinks.get(link.priority_group) ?? []
    group.push(link)
    groupedLinks.set(link.priority_group, group)
  }

  const groupNumbers = [...groupedLinks.keys()].toSorted((a, b) => a - b)
  const otherLabel = t('extracted.referralLinks.referralLinkList.other_f97e9da0')

  return (
    <div className='space-y-4'>
      <p className='text-sm text-muted-foreground'>
        {t('extracted.referralLinks.referralLinkList.linksFromPeopleYouTrustAppear_cd32054f')}
      </p>
      {groupNumbers.map(groupNum => (
        <ReferralLinkGroup
          key={groupNum}
          label={GROUP_LABEL_KEYS[groupNum] ? t(GROUP_LABEL_KEYS[groupNum]) : otherLabel}
          links={groupedLinks.get(groupNum) ?? []}
          response={response}
        />
      ))}
    </div>
  )
}
