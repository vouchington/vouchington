import { readdir, readFile } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientSearchForm } from '../client-search-form'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'

const NATIVE_GET_FORM_RE = /<form[\s\S]*?\bmethod\s*=\s*['"]\s*get\s*['"]/im
function hasNativeGetForm(markup: string): boolean {
  return NATIVE_GET_FORM_RE.test(markup)
}

const mockPush = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: mockPush }),
    }) as unknown as typeof import('next/navigation'),
)

describe('ClientSearchForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.pushState({}, '', '/topics/aliases')
  })

  it('submits searches through the Next router', () => {
    render(
      <ClientSearchForm
        searchParamName='q'
        placeholder='Search aliases...'
        label='Search aliases'
      />,
    )

    fireEvent.change(screen.getByLabelText('Search aliases'), { target: { value: 'venmo' } })
    fireEvent.submit(screen.getByLabelText('Search aliases').closest('form')!)

    expect(mockPush).toHaveBeenCalledWith('/topics/aliases?q=venmo', { scroll: false })
  })

  it('preserves unrelated query params and removes pagination cursors', () => {
    window.history.pushState({}, '', '/urls?hostnameId=host-1&after=cursor-1')

    render(
      <ClientSearchForm
        searchParamName='query'
        placeholder='Search URLs...'
        label='Search URLs'
      />,
    )

    fireEvent.change(screen.getByLabelText('Search URLs'), { target: { value: 'page1' } })
    fireEvent.submit(screen.getByLabelText('Search URLs').closest('form')!)

    expect(mockPush).toHaveBeenCalledWith('/urls?hostnameId=host-1&query=page1', {
      scroll: false,
    })
  })

  it('removes the search param when the query is empty', () => {
    window.history.pushState({}, '', '/topics/aliases?q=venmo&sort=relevance')

    render(
      <ClientSearchForm
        searchParamName='q'
        defaultValue='venmo'
        placeholder='Search aliases...'
        label='Search aliases'
      />,
    )

    fireEvent.change(screen.getByLabelText('Search aliases'), { target: { value: '   ' } })
    fireEvent.submit(screen.getByLabelText('Search aliases').closest('form')!)

    expect(mockPush).toHaveBeenCalledWith('/topics/aliases?sort=relevance', {
      scroll: false,
    })
  })

  it('submits the search via Enter on the input through the Next router', () => {
    render(
      <ClientSearchForm
        searchParamName='q'
        placeholder='Search aliases...'
        label='Search aliases'
      />,
    )

    const input = screen.getByLabelText('Search aliases') as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'keyboard' } })

    void expectInputEnterSubmits({ input, onSubmit: mockPush })
    expect(mockPush).toHaveBeenCalledWith('/topics/aliases?q=keyboard', { scroll: false })
    expect(document.activeElement).toBe(input)
  })

  it('renders a visible mobile-safe submit button', () => {
    render(
      <ClientSearchForm
        searchParamName='q'
        placeholder='Search aliases...'
        label='Search aliases'
      />,
    )

    const button = screen.getByRole('button', { name: 'Search' })
    expect(button).toBeVisible()
    expect(button).toHaveClass('h-11', 'sm:h-9')
  })

  it('preserves input focus when defaultValue updates after submit', () => {
    const { rerender } = render(
      <ClientSearchForm
        searchParamName='q'
        placeholder='Search aliases...'
        label='Search aliases'
      />,
    )

    const input = screen.getByLabelText('Search aliases') as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'venmo' } })
    fireEvent.submit(input.closest('form')!)

    window.history.pushState({}, '', '/topics/aliases?q=venmo')
    rerender(
      <ClientSearchForm
        searchParamName='q'
        defaultValue='venmo'
        placeholder='Search aliases...'
        label='Search aliases'
      />,
    )

    expect(screen.getByLabelText('Search aliases')).toBe(input)
    expect(document.activeElement).toBe(input)
  })

  it('navigates to the bare pathname when clearing the only query param', () => {
    window.history.pushState({}, '', '/topics/aliases?q=venmo&after=cursor-1')

    render(
      <ClientSearchForm
        searchParamName='q'
        defaultValue='venmo'
        placeholder='Search aliases...'
        label='Search aliases'
      />,
    )

    fireEvent.change(screen.getByLabelText('Search aliases'), { target: { value: '' } })
    fireEvent.submit(screen.getByLabelText('Search aliases').closest('form')!)

    expect(mockPush).toHaveBeenCalledWith('/topics/aliases', { scroll: false })
  })
})

describe('native GET search form static-analysis rule', () => {
  it('detects common native GET form spellings', () => {
    expect(hasNativeGetForm('<form method="get">')).toBe(true)
    expect(hasNativeGetForm('<form method = "GET">')).toBe(true)
    expect(hasNativeGetForm("<form className='x' method=' get '>")).toBe(true)
    expect(hasNativeGetForm('<form onSubmit={handleSubmit}>')).toBe(false)
  })

  it('does not allow native GET forms in web app or component source', async () => {
    const files = await listSourceFiles(join(process.cwd(), 'web'))
    const offenders: string[] = []

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      if (hasNativeGetForm(source)) {
        offenders.push(relative(process.cwd(), file).replaceAll('\\', '/'))
      }
    }

    expect(offenders).toEqual([])
  }, 15_000)
})

async function listSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async entry => {
      const path = join(root, entry.name)
      if (entry.isDirectory()) {
        if (!['app', 'components'].includes(entry.name) && basename(root) === 'web') return []
        if (['__tests__', 'node_modules', '.next'].includes(entry.name)) return []
        return listSourceFiles(path)
      }

      return /\.(tsx|ts)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
    }),
  )

  return files.flat()
}
