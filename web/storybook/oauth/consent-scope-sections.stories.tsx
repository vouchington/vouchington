import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { ConsentScopeSections } from '@/app/oauth/consent/consent-scope-sections'
import { storybookScopeCatalogResponse } from '../my/fixtures/scope-catalog'

const meta = {
  title: 'OAuth/Consent scope sections',
  component: ConsentScopeSections,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ConsentScopeSections>
export default meta
type Story = StoryObj<typeof meta>

export const MultipleAudiences: Story = {
  args: {
    catalog: storybookScopeCatalogResponse,
    scopes: ['mcp.user:read', 'community-moderation:read', 'topic-claims:read'],
    sensitiveScopes: ['topic-claims:read'],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Your account' })).toBeVisible()
    await expect(canvas.getByRole('heading', { name: 'Community moderation' })).toBeVisible()
    await expect(canvas.getByRole('heading', { name: 'Brand tools' })).toBeVisible()
    await expect(canvas.getByText('topic-claims:read')).toBeVisible()
  },
}
