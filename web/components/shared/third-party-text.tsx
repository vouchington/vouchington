interface ThirdPartyTextProps {
  as: 'span' | 'p'
  className?: string
  text: string
}

/**
 * Text authored on another service that reports no language. It stays outside the surrounding
 * UI locale: `lang=""` (unknown language, so it does not inherit the page's) and `dir="auto"`, never a guess.
 */
export function ThirdPartyText({ as: Tag, className, text }: ThirdPartyTextProps) {
  return (
    <Tag
      className={className}
      lang=''
      dir='auto'
    >
      {text}
    </Tag>
  )
}
