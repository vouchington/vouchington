import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ImportExportPage } from '@/components/my/import-export/import-export-page'
import { clearMyAccountFixture, setMyAccountFixture } from '@/storybook/mocks/my-account-fixture'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Import Export Page',
  beforeEach() {
    setMyAccountFixture()
    return () => clearMyAccountFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Topics: Story = {
  render: () => (
    <StoryFrame>
      <ImportExportPage
        title='Topics'
        description='Export the topics you follow or import them from another account.'
        feedType='topics'
      />
    </StoryFrame>
  ),
}
