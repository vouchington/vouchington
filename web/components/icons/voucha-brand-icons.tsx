import type { SVGProps } from 'react'

type BrandIconProps = SVGProps<SVGSVGElement>

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- inline SVG wordmarks need image semantics without becoming raster images. */
export function VouchaWordmarkIcon({ className, ...props }: BrandIconProps) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 94 24'
      width='94'
      overflow='visible'
      height='24'
      className={className}
      aria-label='Voucha'
      role='img'
      {...props}
    >
      <path
        d='M2 3 L11 20 L20 3'
        stroke='currentColor'
        strokeWidth='2.5'
        fill='none'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='M6.5 11.5 L11 20 L20 8'
        stroke='currentColor'
        strokeWidth='2.5'
        fill='none'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <text
        x='24'
        y='18'
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontWeight='700'
        fontSize='17'
        fill='currentColor'
        letterSpacing='-0.3'
      >
        Voucha
      </text>
    </svg>
  )
}
/* oxlint-enable jsx-a11y/prefer-tag-over-role */

export function VouchaMarkIcon({ className, ...props }: BrandIconProps) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 32 32'
      width='32'
      height='32'
      className={className}
      {...props}
      aria-hidden='true'
    >
      <path
        d='M4 5 L16 27 L28 5'
        stroke='currentColor'
        strokeWidth='3'
        fill='none'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='M10 16 L16 27 L28 11'
        stroke='currentColor'
        strokeWidth='3'
        fill='none'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}
