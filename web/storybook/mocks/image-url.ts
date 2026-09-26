const storyImage =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

export function getImageUrl(): string {
  return storyImage
}

export function getPlacementImageUrl(): string {
  return storyImage
}

export function buildPlacementImagePath(image?: { image_id: string } | null): string | undefined {
  return image ? storyImage : undefined
}
