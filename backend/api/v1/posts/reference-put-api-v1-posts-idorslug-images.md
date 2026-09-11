# PUT /api/v1/posts/:idOrSlug/images

[Back to Posts API](README.md#put-apiv1postsidorslugimages)

Replaces all images for a post.

**Request:**

```json
{
  "images": [{ "image_id": "<uuid>", "order_index": 0, "caption": "optional" }]
}
```
