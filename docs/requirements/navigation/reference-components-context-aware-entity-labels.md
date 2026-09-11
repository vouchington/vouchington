# UI Components reference

[Back to UI Components](COMPONENTS.md)

## Context-Aware Entity Labels

Topic chips and user bylines must link to the content-kind tab that matches the surrounding surface rather than always landing on the entity root.

**URL helpers** — `web/lib/links/entity-href.ts` (see [`web/lib/links/CLAUDE.md`](../../../web/lib/links/CLAUDE.md)):

- `topicHref(topic, tab?)` — builds `/{topicTypeSlug}/{idOrSlug}[/{tab}]`
- `userHref(user, tab?)` — builds `/user/{usernameOrId}[/{tab}]`
- `topicTabForPostType(postType)` and `userTabForPostType(postType)` — derive the correct tab from `post.post_type`

**Components:**

- `<TopicLabel topic tab? variant? ...>` (`web/components/topics/topic-label.tsx`) — renders a `<Badge asChild>` wrapping a `<Link>`. Use instead of inline `<Badge><Link>` pairs. Accepts HTML attributes (e.g. `data-testid`) forwarded to the anchor via Radix `Slot`.
- `<UserLink user tab? className? ...>` (`web/components/users/user-link.tsx`) — renders a plain `<Link>` for user bylines and @mentions.

**Tab mapping rules:**

| Surface                                | Topic tab       | User tab        |
| -------------------------------------- | --------------- | --------------- |
| Review card / detail                   | `reviews`       | `reviews`       |
| Discussion card / detail               | `posts`         | `discussions`   |
| RSS/news item                          | `news`          | —               |
| Data-point card / detail               | `data-points`   | —               |
| Search, breadcrumbs, trending, compare | _(none — root)_ | _(none — root)_ |

Use `topicTabForPostType(post.post_type)` on `PostCard` and `PostDetail` — the `post_type` field drives the tab without prop drilling. Pass `tab='news'` explicitly on news item components. Leave `tab` undefined on generic listing/search surfaces.

See [`web/CLAUDE.md`](../../../web/CLAUDE.md) for the enforced UI rule.

### Image Lightbox

**Component:** `web/components/posts/post-image-lightbox.tsx` — `PostImageLightbox`

A fullscreen image viewer backed by `Dialog` (Radix UI) and `Carousel` (Embla). Used exclusively by the post detail page to display post images at full viewport size.

**Props:**

| Prop           | Type                                           | Description                                                               |
| -------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| `images`       | `Array<{ image_id: string; caption: string }>` | Ordered array of post images                                              |
| `startIndex`   | `number`                                       | Index of the image to show first (set via `api.scrollTo` on open)         |
| `open`         | `boolean`                                      | Controlled open state                                                     |
| `onOpenChange` | `(open: boolean) => void`                      | Close callback (also triggered by Esc key via Radix Dialog)               |
| `alt`          | `string`                                       | Fallback alt text when an image has no caption (typically the post title) |

**Behavior:**

- Single image: renders directly without a carousel.
- Multiple images: renders a `Carousel` initialized to `startIndex`. Arrow keys navigate slides (Embla built-in). Arrows are positioned inside the viewport at `left-2`/`right-2` so they are always visible regardless of viewport width.
- Esc key closes the dialog (Radix Dialog built-in).
- The dialog is dynamically imported in `post-detail.tsx` (`next/dynamic`) so the lightbox JS only ships when post images are present.

**Usage:**

```tsx
// In post-detail.tsx — see web/components/posts/post-detail.tsx
const PostImageLightbox = dynamic(() =>
  import('./post-image-lightbox').then(mod => mod.PostImageLightbox),
)

// Rendered at the bottom of the images section:
<PostImageLightbox
  images={post.images}
  startIndex={lightboxIndex}
  open={lightboxOpen}
  onOpenChange={setLightboxOpen}
  alt={postTitle}
/>
```

**Related:** [Post Images](../content/POSTS.md#post-images), `web/CLAUDE.md` (carousel arrow placement rule)
