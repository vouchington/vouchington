import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  insertTestPost,
  setPostDeclaredLanguage,
} from '../../../backend/test-helpers/entities/posts.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

const SCREENSHOT_DIR = process.env['TMPDIR'] ?? tmpdir()

/**
 * Seed a discussion post with a specific declared content language.
 * Returns { postId, slug }.
 */
async function seedPostWithLanguage(opts: {
  lang: string
  markdown: string
  suffix: string
}): Promise<{ postId: string; slug: string }> {
  const slug = `content-lang-${opts.lang}-${opts.suffix}`
  const postId = await insertTestPost({
    title: `Content Language ${opts.lang.toUpperCase()} ${opts.suffix}`,
    slug,
    createdById: TEST_USER_ID,
    markdown: opts.markdown,
  })
  await setPostDeclaredLanguage(postId, opts.lang)
  return { postId, slug }
}

test.describe('Content Language Rendering', () => {
  test.use({ storageState: AUTH_STATE })

  // Slugs and IDs set in beforeAll, read in tests.
  let arSlug = ''
  let frSlug = ''
  let jaSlug = ''
  let arPostId = ''
  let arCommentId = ''
  let suffix = ''

  test.beforeAll(async () => {
    // A beforeAll can re-run in the same worker process when Playwright's
    // fullyParallel scheduler hands the worker a second test from this file —
    // module scope is preserved across that re-entry. Generating the suffix
    // here (not at module scope) guarantees a fresh, non-colliding value on
    // every entry, since post_slugs.slug is a global unique key.
    suffix = randomSuffix()

    // Arabic — RTL script
    ;({ postId: arPostId, slug: arSlug } = await seedPostWithLanguage({
      lang: 'ar',
      markdown: 'هذا نص تجريبي باللغة العربية. يجب أن يُعرض من اليمين إلى اليسار مع محاذاة صحيحة.',
      suffix,
    }))

    // Seed an Arabic comment on the Arabic post.
    arCommentId = await insertTestPost({
      title: '',
      slug: `content-lang-ar-comment-${suffix}`,
      createdById: TEST_USER_ID,
      markdown: 'تعليق باللغة العربية للتحقق من اتجاه النص في التعليقات.',
      postType: 'comment',
      rootId: arPostId,
      parentId: arPostId,
    })
    await setPostDeclaredLanguage(arCommentId, 'ar')

    // French — LTR Latin script
    ;({ slug: frSlug } = await seedPostWithLanguage({
      lang: 'fr',
      markdown:
        "Ceci est un texte d'essai en français. Il doit s'afficher de gauche à droite avec un alignement correct.",
      suffix,
    }))

    // Japanese — non-Latin LTR script
    ;({ slug: jaSlug } = await seedPostWithLanguage({
      lang: 'ja',
      markdown: 'これは日本語のテストテキストです。左から右に正しく表示される必要があります。',
      suffix,
    }))
  })

  test('Arabic post (RTL) — lang="ar" and dir="auto" yield rtl computed direction', async ({
    page,
  }) => {
    await navigateTo(page, `/discussion/${arSlug}`)

    const contentEl = page.getByTestId('post-detail-content').locator('[lang]')
    await expect(contentEl).toHaveAttribute('lang', 'ar')
    await expect(contentEl).toHaveAttribute('dir', 'rtl')

    const computedDirection = await contentEl.evaluate(
      (el: Element) => getComputedStyle(el).direction,
    )
    expect(computedDirection).toBe('rtl')

    await contentEl.screenshot({
      path: join(SCREENSHOT_DIR, `content-lang-ar-${suffix}.png`),
    })
  })

  test('Arabic comment (RTL) — lang="ar" and dir="rtl" on comment content', async ({ page }) => {
    await navigateTo(page, `/discussion/${arSlug}`)

    // Wait for comment thread to be visible.
    await expect(page.getByTestId('comment-node-content').first()).toBeVisible()

    // Scope to the first comment-node-content that contains a [lang] element.
    const commentContentEl = page
      .getByTestId('comment-node-content')
      .first()
      .locator('[lang]')
      .first()
    await expect(commentContentEl).toHaveAttribute('lang', 'ar')
    await expect(commentContentEl).toHaveAttribute('dir', 'rtl')

    const computedDirection = await commentContentEl.evaluate(
      (el: Element) => getComputedStyle(el).direction,
    )
    expect(computedDirection).toBe('rtl')
  })

  test('French post (LTR Latin) — lang="fr" and dir="ltr" yield ltr computed direction', async ({
    page,
  }) => {
    await navigateTo(page, `/discussion/${frSlug}`)

    const contentEl = page.getByTestId('post-detail-content').locator('[lang]')
    await expect(contentEl).toHaveAttribute('lang', 'fr')
    await expect(contentEl).toHaveAttribute('dir', 'ltr')

    const computedDirection = await contentEl.evaluate(
      (el: Element) => getComputedStyle(el).direction,
    )
    expect(computedDirection).toBe('ltr')

    await contentEl.screenshot({
      path: join(SCREENSHOT_DIR, `content-lang-fr-${suffix}.png`),
    })
  })

  test('Japanese post (non-Latin LTR) — lang="ja" and dir="ltr" yield ltr computed direction', async ({
    page,
  }) => {
    await navigateTo(page, `/discussion/${jaSlug}`)

    const contentEl = page.getByTestId('post-detail-content').locator('[lang]')
    await expect(contentEl).toHaveAttribute('lang', 'ja')
    await expect(contentEl).toHaveAttribute('dir', 'ltr')

    const computedDirection = await contentEl.evaluate(
      (el: Element) => getComputedStyle(el).direction,
    )
    expect(computedDirection).toBe('ltr')

    await contentEl.screenshot({
      path: join(SCREENSHOT_DIR, `content-lang-ja-${suffix}.png`),
    })
  })
})
