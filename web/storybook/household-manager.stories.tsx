import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { HouseholdManager } from '@/components/my/household-manager'
import { HouseholdSectionView } from '@/components/my/household-section'
import type { HouseholdSection } from '@/types/my'

const owner: HouseholdSection = {
  household: { id: 'household-owned', owner_id: 'user-1', updated_at: '2026-07-02' },
  isOwner: true,
  membershipLoadError: false,
  membershipPageInfo: {
    has_next_page: false,
    start_cursor: null,
    end_cursor: null,
  },
  memberships: [
    {
      id: 'membership-1',
      household_id: 'household-owned',
      relationship: 'spouse',
      updated_at: '2026-07-02',
      individual: {
        id: 'individual-1',
        user_id: 'user-2',
        username: 'alice',
        updated_at: '2026-07-02',
      },
    },
  ],
}

const shared: HouseholdSection = {
  ...owner,
  household: { id: 'household-shared', owner_id: 'user-3', updated_at: '2026-07-01' },
  isOwner: false,
  memberships: [
    {
      ...owner.memberships[0]!,
      id: 'membership-2',
      household_id: 'household-shared',
      relationship: null,
      individual: {
        id: '00000000-0000-7000-8000-000000000099',
        user_id: null,
        username: null,
        updated_at: '2026-07-01',
      },
    },
  ],
}

const meta = {
  title: 'My/Household Manager',
  component: HouseholdManager,
} satisfies Meta<typeof HouseholdManager>

export default meta
type Story = StoryObj<typeof meta>

const terminalPageInfo = {
  has_next_page: false,
  start_cursor: null,
  end_cursor: null,
}

function sharedPage(...sections: HouseholdSection[]) {
  return {
    results: sections.map(section => ({ id: section.household.id, section })),
    page_info: terminalPageInfo,
  }
}

export const NoOwnedHousehold: Story = {
  args: {
    initialOwnedSection: null,
    initialSharedPage: sharedPage(shared),
    ownedProbeSucceeded: true,
    sharedLoadError: false,
  },
}

export const OwnedAndShared: Story = {
  args: {
    initialOwnedSection: owner,
    initialSharedPage: sharedPage(shared),
    ownedProbeSucceeded: true,
    sharedLoadError: false,
  },
}

export const PartialLoadFailure: Story = {
  args: {
    initialOwnedSection: owner,
    initialSharedPage: sharedPage({ ...shared, memberships: [], membershipLoadError: true }),
    ownedProbeSucceeded: true,
    sharedLoadError: false,
  },
}

export const MembershipContinuation: Story = {
  args: {
    initialOwnedSection: {
      ...owner,
      membershipPageInfo: {
        has_next_page: true,
        start_cursor: 'membership-first',
        end_cursor: 'membership-next',
      },
    },
    initialSharedPage: sharedPage(),
    ownedProbeSucceeded: true,
    sharedLoadError: false,
  },
}

export const SharedHouseholdRetry: Story = {
  args: {
    initialOwnedSection: owner,
    initialSharedPage: sharedPage(),
    ownedProbeSucceeded: true,
    sharedLoadError: true,
  },
}

export const OwnedSectionConfirmation: Story = {
  args: {
    initialOwnedSection: null,
    initialSharedPage: sharedPage(),
    ownedProbeSucceeded: true,
    sharedLoadError: false,
  },
  render: () => (
    <HouseholdSectionView
      confirmingKey='household-owned:membership-1'
      onCancelRemove={fn()}
      onConfirmRemove={fn()}
      onRequestRemove={fn()}
      onRetry={fn()}
      retrying={false}
      section={owner}
      sharedCount={1}
      sharedIndex={0}
    />
  ),
}
