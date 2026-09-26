import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { CommandSearch } from '@/components/command-search'
import { FeatureFlagsProvider } from '@/lib/feature-flags/context'
import '@/storybook/mocks/client-api-instance'
import {
  clearCombinedSearchFixture,
  setCombinedSearchFixture,
} from '@/storybook/mocks/story-combined-search'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Command Search/Command Search',
  beforeEach() {
    setCombinedSearchFixture()
    return () => clearCombinedSearchFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function SearchPreview({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <StoryFrame>
      <FeatureFlagsProvider globalFlags={{ combinedSearch: true }}>
        <CommandSearch
          open
          onOpenChange={() => {}}
          isAdmin={false}
          isAuthenticated={isAuthenticated}
        />
      </FeatureFlagsProvider>
    </StoryFrame>
  )
}

async function expectReadyDialog({ canvasElement }: { canvasElement: HTMLElement }) {
  const body = within(canvasElement.ownerDocument.body)
  await expect(await body.findByPlaceholderText('Search...')).toBeVisible()
  await expect(body.getByText('Type to search...')).toBeVisible()
}

export const Ready: Story = {
  render: () => <SearchPreview isAuthenticated />,
  play: expectReadyDialog,
}

export const SignedOut: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => <SearchPreview isAuthenticated={false} />,
  play: expectReadyDialog,
}
