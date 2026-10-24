import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { CellValue } from '@/components/memberships/plan-comparison-table-cell-value'
import { useTranslations } from '@/lib/i18n/use-translations'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Memberships/Plan Comparison Cell Value',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Cells() {
  const t = useTranslations()
  return (
    <StoryFrame width='max-w-sm'>
      <dl className='grid grid-cols-2 gap-3 text-sm'>
        <dt>Included</dt>
        <dd>
          <CellValue
            value
            t={t}
          />
        </dd>
        <dt>Not included</dt>
        <dd>
          <CellValue
            value={false}
            t={t}
          />
        </dd>
        <dt>Quantity</dt>
        <dd>
          <CellValue
            value='3 agents'
            t={t}
          />
        </dd>
      </dl>
    </StoryFrame>
  )
}

export const AllValueKinds: Story = {
  render: () => <Cells />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByText('3 agents')).toBeVisible()
    await expect(canvas.getByLabelText('Included')).toBeVisible()
    await expect(canvas.getByLabelText('Not included')).toBeVisible()
  },
}
