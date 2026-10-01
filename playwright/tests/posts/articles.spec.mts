import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { syncLocalArticles } from '../../../backend/services/articles/sync.mts'
import { createTestUser } from '../../../backend/test-helpers/index.mts'

let sourceSlug = ''
let targetSlug = ''
let targetTitle = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()
  sourceSlug = `link-source-${suffix}`
  targetSlug = `link-target-${suffix}`
  targetTitle = `Link Target ${suffix}`

  // Authored the way the committed articles are: relative `./slug.md` links, synced for real.
  const articlesDir = await mkdtemp(join(tmpdir(), 'pw-articles-'))
  try {
    await writeFile(
      join(articlesDir, `${sourceSlug}.md`),
      `---\ntitle: Link Source ${suffix}\nslug: ${sourceSlug}\n---\nRead [the target article](./${targetSlug}.md).\n`,
    )
    await writeFile(
      join(articlesDir, `${targetSlug}.md`),
      `---\ntitle: ${targetTitle}\nslug: ${targetSlug}\n---\nTarget body.\n`,
    )
    const admin = await createTestUser({ administrator: true })
    const { summary } = await syncLocalArticles(admin, articlesDir)
    if (summary.created !== 2) throw new Error(`Article sync failed: ${JSON.stringify(summary)}`)
  } finally {
    await rm(articlesDir, { force: true, recursive: true })
  }
})

test.describe('Articles Page', () => {
  test('should display articles list page', async ({ page }) => {
    await navigateTo(page, '/articles')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Articles')
    await expect(page.getByLabel('Search list')).toBeVisible()
  })

  test('relative ./slug.md article links open the article page, not the markdown alias', async ({
    page,
  }) => {
    await navigateTo(page, `/article/${sourceSlug}`)

    const link = page.locator(`a[href$="/article/${targetSlug}"]`)
    await expect(link).toBeVisible()
    await expect(page.locator('a[href$=".md"]')).toHaveCount(0)

    await link.click()

    await expect(page).toHaveURL(new RegExp(`/article/${targetSlug}$`))
    await expect(page.getByTestId('post-detail-heading')).toContainText(targetTitle)
  })
})
