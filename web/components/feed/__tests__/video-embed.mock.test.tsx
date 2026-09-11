import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VideoEmbed } from '../video-embed'

vi.mock(import('next/image'), () => {
  const Img = 'img' as const

  return {
    default: ({ src, alt }: { src: string; alt: string }) => (
      <Img
        src={src}
        alt={alt}
      />
    ),
  } as unknown as typeof import('next/image')
})

describe('VideoEmbed', () => {
  it('renders play button before expansion', () => {
    const { getByRole } = render(
      <VideoEmbed
        platform='youtube'
        playerUrl='https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
        title='Test Video'
      />,
    )
    expect(getByRole('button', { name: /play test video/i })).toBeTruthy()
  })

  it('renders iframe with allow-same-origin in sandbox after clicking play', () => {
    const { getByRole, getByTitle } = render(
      <VideoEmbed
        platform='youtube'
        playerUrl='https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
        title='Test Video'
      />,
    )
    fireEvent.click(getByRole('button', { name: /play test video/i }))
    const iframe = getByTitle('Test Video') as HTMLIFrameElement
    const sandbox = iframe.getAttribute('sandbox') ?? ''
    expect(sandbox).toContain('allow-same-origin')
    expect(sandbox).toContain('allow-scripts')
  })

  it('embeds the correct youtube-nocookie URL', () => {
    const { getByRole, getByTitle } = render(
      <VideoEmbed
        platform='youtube'
        playerUrl='https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
        title='Test Video'
      />,
    )
    fireEvent.click(getByRole('button', { name: /play test video/i }))
    const iframe = getByTitle('Test Video') as HTMLIFrameElement
    expect(iframe.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })

  it('preserves playback for legacy rows that only have a normalized video ID', () => {
    const { getByRole, getByTitle } = render(
      <VideoEmbed
        platform='vimeo'
        videoId='123456789'
        title='Legacy Video'
      />,
    )
    fireEvent.click(getByRole('button', { name: /play legacy video/i }))
    const iframe = getByTitle('Legacy Video') as HTMLIFrameElement
    expect(iframe.getAttribute('src')).toBe('https://player.vimeo.com/video/123456789')
  })

  it('does not reconstruct playback when the API authoritatively returns no player URL', () => {
    const { queryByRole, getByRole } = render(
      <VideoEmbed
        platform='youtube'
        playerUrl={null}
        videoId='abc123'
        title='External-only video'
        itemUrl='https://www.youtube.com/watch?v=abc123'
      />,
    )
    expect(queryByRole('button', { name: /play/i })).toBeNull()
    expect(getByRole('link', { name: /watch on youtube/i })).toBeTruthy()
  })

  it('renders external link fallback for untrusted platform', () => {
    const { queryByRole, getByRole } = render(
      <VideoEmbed
        platform='dailymotion'
        title='Test Video'
        itemUrl='https://www.dailymotion.com/video/abc123'
      />,
    )
    expect(queryByRole('button', { name: /play/i })).toBeNull()
    expect(getByRole('link', { name: /watch on dailymotion/i })).toBeTruthy()
  })

  it('renders external link fallback for peertube (trusted but no embed URL)', () => {
    const { queryByRole, getByRole } = render(
      <VideoEmbed
        platform='peertube'
        title='Test Video'
        itemUrl='https://peertube.example.com/videos/watch/some-video-id'
      />,
    )
    expect(queryByRole('button', { name: /play/i })).toBeNull()
    expect(getByRole('link', { name: /watch on peertube/i })).toBeTruthy()
  })

  it('renders an external link fallback for an unsafe API player URL', () => {
    const { queryByRole, getByRole } = render(
      <VideoEmbed
        platform='youtube'
        playerUrl='javascript:alert(1)'
        title='Test Video'
        itemUrl='https://www.youtube.com/watch?v=abc123'
      />,
    )
    expect(queryByRole('button', { name: /play/i })).toBeNull()
    expect(getByRole('link', { name: /watch on youtube/i })).toBeTruthy()
  })

  it('rejects a player URL that does not match its normalized platform', () => {
    const { queryByRole, getByRole } = render(
      <VideoEmbed
        platform='vimeo'
        playerUrl='https://www.youtube-nocookie.com/embed/abc123'
        title='Test Video'
        itemUrl='https://vimeo.com/123'
      />,
    )
    expect(queryByRole('button', { name: /play/i })).toBeNull()
    expect(getByRole('link', { name: /watch on vimeo/i })).toBeTruthy()
  })

  it.each([
    'https://user@www.youtube-nocookie.com/embed/abc123',
    'https://www.youtube-nocookie.com:443/embed/abc123',
    'https://www.youtube-nocookie.com:8443/embed/abc123',
  ])('rejects player authority decorations: %s', playerUrl => {
    const { queryByRole, getByRole } = render(
      <VideoEmbed
        platform='youtube'
        playerUrl={playerUrl}
        title='Test Video'
        itemUrl='https://www.youtube.com/watch?v=abc123'
      />,
    )
    expect(queryByRole('button', { name: /play/i })).toBeNull()
    expect(getByRole('link', { name: /watch on youtube/i })).toBeTruthy()
  })
})
