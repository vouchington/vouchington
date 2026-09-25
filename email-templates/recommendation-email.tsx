import { render } from './react-email-runtime.mts'
import { emailOptional } from './catalog-copy.mts'
import { getLocalizedSignoff } from './locale.mts'
import {
  RecommendationEmailLayout,
  type RecommendationEmailLayoutProps,
} from './recommendation-email-layout.tsx'
import type { EmailRenderResultPromise, PreviewableEmailComponent } from './types.mts'

function recommendationEmailText({
  locale,
  t,
  userName,
  recommendations,
  settingsUrl,
  unsubscribeUrl,
  physicalAddress,
}: RecommendationEmailLayoutProps): string {
  return [
    emailOptional(t, 'greeting', userName),
    '',
    t('bodyText'),
    '',
    ...recommendations.flatMap(recommendation => [
      recommendation.name,
      recommendation.detail,
      `${t('itemButton')}: ${recommendation.url}`,
      '',
    ]),
    `${t('manage')}: ${settingsUrl}`,
    '',
    `${t('unsubscribe')}: ${unsubscribeUrl}`,
    '',
    getLocalizedSignoff(locale),
    '',
    physicalAddress,
  ].join('\n')
}

// The sent HTML renders the same component the React Email preview server shows.
export function createRecommendationEmail<TProps extends object>(
  toLayoutProps: (props: TProps) => RecommendationEmailLayoutProps,
): PreviewableEmailComponent<TProps> & { render: (props: TProps) => EmailRenderResultPromise } {
  const Email: PreviewableEmailComponent<TProps> = props => (
    <RecommendationEmailLayout {...toLayoutProps(props)} />
  )
  async function renderEmail(props: TProps): EmailRenderResultPromise {
    const layoutProps = toLayoutProps(props)
    return {
      subject: layoutProps.t('subject'),
      html: await render(<Email {...props} />, { pretty: true }),
      text: recommendationEmailText(layoutProps),
    }
  }
  return Object.assign(Email, { render: renderEmail })
}
