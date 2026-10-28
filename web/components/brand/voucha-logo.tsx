import type { ComponentProps } from 'react'
import { VouchaWordmarkIcon } from '@/components/icons/voucha-brand-icons'

type BrandMarkProps = ComponentProps<typeof VouchaWordmarkIcon>

export function VouchaLogo(props: BrandMarkProps) {
  return (
    <VouchaWordmarkIcon
      data-pw='voucha-logo'
      {...props}
    />
  )
}
