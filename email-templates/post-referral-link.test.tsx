import { describe } from 'vitest'
import { renderPostReferralLinkEmail } from './post-referral-link-renderer.mts'
import PostReferralLinkEmail from './post-referral-link.tsx'
import { registerRecommendationEmailRenderTests } from './test-helpers/recommendation-email-render-tests.mts'

const settingsUrl = 'https://voucha.ai/my/landing-pages'
const includedPrograms = [
  {
    name: 'Travel Cards',
    url: 'https://voucha.ai/referral-programs/travel-cards',
    linkCount: 2,
  },
]
const omittedPrograms = [
  {
    name: 'Travel Cards',
    url: 'https://voucha.ai/referral-programs/travel-cards',
  },
  {
    name: 'Food Delivery',
    url: 'https://voucha.ai/referral-programs/food-delivery',
    linkCount: 1,
  },
]

describe('renderPostReferralLinkEmail', () => {
  registerRecommendationEmailRenderTests({
    render: renderPostReferralLinkEmail,
    previewProps: PostReferralLinkEmail.PreviewProps!,
    subject: 'Referral links from your circle',
    snapshotStem: 'post-referral-link',
    testModuleUrl: import.meta.url,
    includedCopy: {
      props: {
        userName: 'Jordan',
        referralPrograms: includedPrograms,
        settingsUrl,
      },
      fragments: ['2 active links'] as const,
    },
    omittedValues: {
      props: uiLocale => ({
        userName: undefined,
        referralPrograms: omittedPrograms,
        settingsUrl,
        uiLocale,
      }),
      rows: [
        ['es', 'Hola,', 'Abre el programa y actualiza tus enlaces.', '1 enlace activo'],
        ['fr', 'Bonjour,', 'Ouvrez le programme et mettez vos liens à jour.', '1 lien actif'],
        ['pt', 'Olá,', 'Abra o programa e atualize seus links.', '1 link ativo'],
      ] as const,
    },
  })
})
