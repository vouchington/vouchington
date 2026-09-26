import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { CheckoutButton } from '@/components/memberships/checkout-button'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Memberships/Checkout Button',
  component: CheckoutButton,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta<typeof CheckoutButton>

export default meta
type Story = StoryObj<typeof meta>

function PlusCheckout({
  planSlug,
  productId,
  planName,
}: {
  planSlug: string
  productId: string
  planName: string
}) {
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  return (
    <StoryFrame width='max-w-sm'>
      {checkoutUrl ? (
        <p>Checkout started at {checkoutUrl}</p>
      ) : (
        <CheckoutButton
          planSlug={planSlug}
          productId={productId}
          planName={planName}
          onCheckout={setCheckoutUrl}
        />
      )}
    </StoryFrame>
  )
}

export const Plus: Story = {
  args: { planSlug: 'plus', productId: 'plus-monthly', planName: 'Plus' },
  render: args => <PlusCheckout {...args} />,
}
