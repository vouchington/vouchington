import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { componentStoryRatchetParameters } from './component-story-ratchet-parameters'
import {
  ComponentStoryRatchetGrid,
  type RatchetedComponent,
} from './component-story-ratchet-renderer'
import { DismissibleAside as AsidesDismissibleAsideDismissibleAside } from '@/components/asides/dismissible-aside'
import { TrendingTopicsAside as AsidesTrendingTopicsAsideTrendingTopicsAside } from '@/components/asides/trending-topics-aside'
import { LoginCodeStep as AuthLoginCodeStepLoginCodeStep } from '@/components/auth/login-code-step'
import AuthMfaStepDefault from '@/components/auth/mfa-step'
import {
  AppleLoginButton as AuthOauthProviderButtonsAppleLoginButton,
  FacebookLoginButton as AuthOauthProviderButtonsFacebookLoginButton,
  GithubLoginButton as AuthOauthProviderButtonsGithubLoginButton,
  GoogleLoginButton as AuthOauthProviderButtonsGoogleLoginButton,
  LinkedInLoginButton as AuthOauthProviderButtonsLinkedInLoginButton,
  MicrosoftLoginButton as AuthOauthProviderButtonsMicrosoftLoginButton,
  XLoginButton as AuthOauthProviderButtonsXLoginButton,
} from '@/components/auth/oauth-provider-buttons'
import { CommandSearch as CommandSearchCommandSearch } from '@/components/command-search'
import { CommandLinkItem as CommandSearchCommandLinkItemCommandLinkItem } from '@/components/command-search/command-link-item'
import {
  CommunityResults as CommandSearchResultGroupsExtraCommunityResults,
  DomainResults as CommandSearchResultGroupsExtraDomainResults,
  FediverseResults as CommandSearchResultGroupsExtraFediverseResults,
  NewsResults as CommandSearchResultGroupsExtraNewsResults,
} from '@/components/command-search/result-groups-extra'

const ratchetedComponentsPart2 = [
  {
    key: 'web/components/asides/dismissible-aside.tsx#DismissibleAside',
    component: AsidesDismissibleAsideDismissibleAside,
  },
  {
    key: 'web/components/asides/trending-topics-aside.tsx#TrendingTopicsAside',
    component: AsidesTrendingTopicsAsideTrendingTopicsAside,
  },
  {
    key: 'web/components/auth/login-code-step.tsx#LoginCodeStep',
    component: AuthLoginCodeStepLoginCodeStep,
  },
  { key: 'web/components/auth/mfa-step.tsx#default', component: AuthMfaStepDefault },
  {
    key: 'web/components/auth/oauth-provider-buttons.tsx#AppleLoginButton',
    component: AuthOauthProviderButtonsAppleLoginButton,
  },
  {
    key: 'web/components/auth/oauth-provider-buttons.tsx#FacebookLoginButton',
    component: AuthOauthProviderButtonsFacebookLoginButton,
  },
  {
    key: 'web/components/auth/oauth-provider-buttons.tsx#GithubLoginButton',
    component: AuthOauthProviderButtonsGithubLoginButton,
  },
  {
    key: 'web/components/auth/oauth-provider-buttons.tsx#GoogleLoginButton',
    component: AuthOauthProviderButtonsGoogleLoginButton,
  },
  {
    key: 'web/components/auth/oauth-provider-buttons.tsx#LinkedInLoginButton',
    component: AuthOauthProviderButtonsLinkedInLoginButton,
  },
  {
    key: 'web/components/auth/oauth-provider-buttons.tsx#MicrosoftLoginButton',
    component: AuthOauthProviderButtonsMicrosoftLoginButton,
  },
  {
    key: 'web/components/auth/oauth-provider-buttons.tsx#XLoginButton',
    component: AuthOauthProviderButtonsXLoginButton,
  },
  { key: 'web/components/command-search.tsx#CommandSearch', component: CommandSearchCommandSearch },
  {
    key: 'web/components/command-search/command-link-item.tsx#CommandLinkItem',
    component: CommandSearchCommandLinkItemCommandLinkItem,
  },
  {
    key: 'web/components/command-search/result-groups-extra.tsx#CommunityResults',
    component: CommandSearchResultGroupsExtraCommunityResults,
  },
  {
    key: 'web/components/command-search/result-groups-extra.tsx#DomainResults',
    component: CommandSearchResultGroupsExtraDomainResults,
  },
  {
    key: 'web/components/command-search/result-groups-extra.tsx#FediverseResults',
    component: CommandSearchResultGroupsExtraFediverseResults,
  },
  {
    key: 'web/components/command-search/result-groups-extra.tsx#NewsResults',
    component: CommandSearchResultGroupsExtraNewsResults,
  },
] satisfies RatchetedComponent[]

const meta = { title: 'Coverage/Component Story Ratchet Part 2' } satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CoveragePart2: Story = {
  parameters: componentStoryRatchetParameters,
  render: () => (
    <ComponentStoryRatchetGrid
      title='Component Story Ratchet Part 2'
      components={ratchetedComponentsPart2}
    />
  ),
}
