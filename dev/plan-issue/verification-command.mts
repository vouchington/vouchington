import { type MarkdownNode } from './markdown.mts'
import { isMeaningfulEvidence } from './evidence-values.mts'
import { CD_PREFIX } from './verification-command-tokens.mts'

const EXECUTABLE_RE =
  /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*(?:[a-z_][\w.+-]*\s+\S+|\.{0,2}\/[\w./-]+(?:\s|$))/m

function isShellCodeNode(node: MarkdownNode): boolean {
  if (node.type !== 'code' && node.type !== 'inlineCode') return false
  return (
    node.type !== 'code' ||
    node.lang === null ||
    node.lang === undefined ||
    /^(?:bash|sh|shell|zsh)$/i.test(node.lang)
  )
}

function looksLikeExecutable(command: string): boolean {
  if (/<[^>]+>/.test(command) || !isMeaningfulEvidence(command)) return false
  const executable = CD_PREFIX.test(command)
    ? command.replace(CD_PREFIX, '').replace(/\)\s*$/, '')
    : command
  return EXECUTABLE_RE.test(executable)
}

function visit(nodes: MarkdownNode[], visitNode: (node: MarkdownNode) => void): void {
  for (const node of nodes) {
    visitNode(node)
    visit(node.children ?? [], visitNode)
  }
}

export function collectCodeCommands(nodes: MarkdownNode[]): string[] {
  const commands: string[] = []
  visit(nodes, node => {
    if (!isShellCodeNode(node)) return
    const value = node.value?.trim() ?? ''
    const lines = node.type === 'inlineCode' ? [value] : value.split('\n').map(line => line.trim())
    for (const line of lines) {
      if (line !== '' && !line.startsWith('#') && looksLikeExecutable(line)) commands.push(line)
    }
  })
  return commands
}

export function hasCodeCommand(nodes: MarkdownNode[]): boolean {
  return collectCodeCommands(nodes).length > 0
}
