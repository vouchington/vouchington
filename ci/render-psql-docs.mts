#!/usr/bin/env node

/* oxlint-disable no-restricted-imports -- docs-publish needs a GFM-aware Markdown-to-HTML renderer */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_SCHEMA_DIR = resolve(__dirname, '..', 'backend/data-stores/psql/schema-snapshot')

const PAGE_STYLE = `
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 80rem; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.5; color: #1a1a1a; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.875rem; }
  th, td { border: 1px solid #d0d0d0; padding: 0.35rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  code { font-family: ui-monospace, monospace; background: #f5f5f5; padding: 0.1rem 0.3rem; border-radius: 3px; }
  h2 { border-top: 1px solid #d0d0d0; padding-top: 1.5rem; margin-top: 2rem; }
`

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
${body}
</body>
</html>
`
}

export async function renderMarkdownToHtml(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown)
  return String(file)
}

function markdownForHtml(markdown: string): string {
  return markdown.replaceAll(
    /\]\((?![a-z]+:|\/|#)([^)\s]+)\.md((?:#[^)\s]+)?)\)/giu,
    (_match, path: string, anchor: string) =>
      `](${path.endsWith('README') ? `${path.slice(0, -'README'.length)}index` : path}.html${anchor})`,
  )
}

function markdownWithPublishedAssetPaths(path: string, markdown: string): string {
  if (path !== 'README.md') return markdown
  return markdown
    .replaceAll('[schema-snapshot/README.md](../README.md)', '`schema-snapshot/README.md`')
    .replaceAll('](../schema.json)', '](schema.json)')
}

function markdownForPublishedRaw(path: string, markdown: string): string {
  const rebased = markdownWithPublishedAssetPaths(path, markdown)
  if (path === 'README.md') return rebased
  return rebased
    .replaceAll('](../README.md)', '](../schema.md)')
    .replaceAll('](README.md)', '](schema.md)')
}

async function readSchemaSnapshotFile(path: string): Promise<string> {
  return readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    throw new Error(`Cannot read PostgreSQL schema snapshot at ${path}: ${error.message}`)
  })
}

async function schemaMarkdownFiles(schemaDir: string): Promise<Map<string, string>> {
  const markdownRoot = join(schemaDir, 'markdown')
  const entries = await readdir(markdownRoot, { recursive: true, withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      throw new Error(
        `Cannot read PostgreSQL schema Markdown directory at ${markdownRoot}: ${error.message}`,
      )
    },
  )
  const fileReads: Promise<readonly [string, string]>[] = []
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      fileReads.push(
        (async () => {
          const relativePath = join(relative(markdownRoot, entry.parentPath), entry.name)
          return [
            relativePath,
            await readSchemaSnapshotFile(join(entry.parentPath, entry.name)),
          ] as const
        })(),
      )
    }
  }
  const files = await Promise.all(fileReads)
  return new Map(files.toSorted(([left], [right]) => left.localeCompare(right)))
}

export async function renderPsqlDocs({
  outputDir,
  schemaDir = DEFAULT_SCHEMA_DIR,
}: {
  outputDir: string
  schemaDir?: string
}): Promise<void> {
  const markdownFiles = await schemaMarkdownFiles(schemaDir)
  const json = await readSchemaSnapshotFile(join(schemaDir, 'schema.json'))
  const indexMarkdown = markdownFiles.get('README.md')
  if (!indexMarkdown)
    throw new Error(
      `Cannot read PostgreSQL schema index at ${join(schemaDir, 'markdown/README.md')}`,
    )

  await mkdir(outputDir, { recursive: true })
  const leafWrites: Promise<unknown>[] = []
  for (const [path, markdown] of markdownFiles) {
    if (path !== 'README.md') {
      leafWrites.push(
        (async () => {
          await mkdir(dirname(join(outputDir, path)), { recursive: true })
          await Promise.all([
            writeFile(join(outputDir, path), markdownForPublishedRaw(path, markdown)),
            writeFile(
              join(outputDir, path.replace(/\.md$/u, '.html')),
              htmlPage(
                'PostgreSQL Schema Snapshot',
                await renderMarkdownToHtml(
                  markdownForHtml(markdownWithPublishedAssetPaths(path, markdown)),
                ),
              ),
            ),
          ])
        })(),
      )
    }
  }
  await Promise.all([
    writeFile(
      join(outputDir, 'index.html'),
      htmlPage(
        'PostgreSQL Schema Snapshot',
        await renderMarkdownToHtml(
          markdownForHtml(markdownWithPublishedAssetPaths('README.md', indexMarkdown)),
        ),
      ),
    ),
    writeFile(join(outputDir, 'schema.md'), markdownForPublishedRaw('README.md', indexMarkdown)),
    writeFile(join(outputDir, 'schema.json'), json),
    ...leafWrites,
  ])
}

function usage(): string {
  return 'Usage: render-psql-docs.mts <output-dir>'
}

export async function main(argv: string[]): Promise<number> {
  const [outputDir] = argv
  if (!outputDir) {
    console.error(usage())
    return 2
  }
  try {
    await renderPsqlDocs({ outputDir })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }
  return 0
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === resolve(invokedPath)) {
  process.exit(await main(process.argv.slice(2)))
}
