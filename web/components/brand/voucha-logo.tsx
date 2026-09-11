import type { ComponentProps } from 'react'
import { VouchaMarkIcon, VouchaWordmarkIcon } from '@/components/icons/voucha-brand-icons'

type BrandMarkProps = ComponentProps<typeof VouchaWordmarkIcon>

export function VouchaLogo(props: BrandMarkProps) {
  return (
    <VouchaWordmarkIcon
      data-pw='voucha-logo'
      {...props}
    />
  )
}

export function VouchaIcon(props: BrandMarkProps) {
  return (
    <VouchaMarkIcon
      data-pw='voucha-icon'
      {...props}
    />
  )
}
