export type EmailCopySource = { path: string; text: string }

export function residualProductCopy(files: readonly EmailCopySource[]): string[] {
  return files.flatMap(({ path, text }) => {
    if (!path.endsWith('.mts') && !path.endsWith('.tsx')) return []
    if (path.includes('.test.')) return []
    const localeRegistry = text.includes('ByLocale')
    const localeBranch = /locale === '(?:en|es|fr|pt)'/.test(text) && path !== 'catalog-copy.mts'
    return localeRegistry || localeBranch ? [path] : []
  })
}
