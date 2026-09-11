import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { CommunitySettingsFields } from '@/components/communities/community-settings-fields'

const meta = {
  title: 'Design System/Components/Settings Layout',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const PageHeader: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-3xl'>
        <SettingsPageHeader
          title='Profile'
          description='Your public profile shown to other users'
        />
      </div>
    </main>
  ),
}

export const CommunitySettings: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-2xl space-y-6'>
        <SettingsPageHeader
          title='Community'
          description='Membership, posting, and list settings'
        />
        <CommunitySettingsFields
          name='Community Alpha'
          slug='community-alpha'
          markdown='A fixture-backed community used to review settings controls.'
          visibility='public'
          listType='follow'
          memberRosterVisibility='members'
          requiresPostApproval={false}
          allowMemberInvites
          setName={() => {}}
          setSlug={() => {}}
          setMarkdown={() => {}}
          setVisibility={() => {}}
          setListType={() => {}}
          setMemberRosterVisibility={() => {}}
          setRequiresPostApproval={() => {}}
          setAllowMemberInvites={() => {}}
        />
      </div>
    </main>
  ),
}
