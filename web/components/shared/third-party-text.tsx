interface ThirdPartyTextProps {
  as: 'span' | 'p'
  className?: string
  text: string
}

/**
 * Text authored on another service that reports no language. It stays outside the surrounding
 * UI locale: `dir="auto"` and no `lang`, never a guess.
 */
export function ThirdPartyText({ as: Tag, className, text }: ThirdPartyTextProps) {
  return (
    <Tag
      className={className}
      dir='auto'
    >
      {text}
    </Tag>
  )
}
