type IdInput = { id: string }

function idOrValue(input: string | IdInput): string {
  return typeof input === 'string' ? input : input.id
}

export function listHref(list: string | IdInput): string {
  return `/list/${idOrValue(list)}`
}
