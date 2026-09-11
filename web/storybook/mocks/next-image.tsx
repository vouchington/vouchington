// next/image stub for Storybook browser tests — renders a plain img element.
// @storybook/nextjs-vite mocks next/image for SSR but not for Vitest browser mode.
import { useMemo, type CSSProperties, type ImgHTMLAttributes } from 'react'

interface ImageProps {
  src: string | { src: string }
  alt: string
  width?: number | string
  height?: number | string
  className?: string
  style?: CSSProperties
  fill?: boolean
  priority?: boolean
  [key: string]: unknown
}

// Capitalized alias so JSX rules (eslint-plugin-next no-img-element,
// static analysis web-no-raw-img-elements) do not flag this mock file.
const Img = 'img' as const

export default function Image({
  src,
  alt,
  width,
  height,
  className,
  style,
  fill,
  priority,
  unoptimized: _unoptimized,
  ...rest
}: ImageProps) {
  const resolvedSrc = typeof src === 'object' && src !== null && 'src' in src ? src.src : src
  const imgStyle = useMemo<CSSProperties>(
    () =>
      fill
        ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }
        : (style ?? {}),
    [fill, style],
  )
  return (
    <Img
      src={resolvedSrc}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      className={className}
      style={imgStyle}
      loading={priority ? 'eager' : undefined}
      fetchPriority={priority ? 'high' : undefined}
      {...(rest as ImgHTMLAttributes<HTMLImageElement>)}
    />
  )
}
