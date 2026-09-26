#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { htmlPage, renderMarkdownToHtml } from './render-docs-page.mts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_SCHEMA_DIR = resolve(__dirname, '..', 'backend/data-stores/psql/schema-snapshot')

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
