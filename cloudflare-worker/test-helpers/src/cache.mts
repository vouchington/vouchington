export class MemoryCache {
  private readonly store = new Map<string, Response>()

  match(request: Request): Promise<Response | undefined> {
    return Promise.resolve(this.store.get(`${request.method}:${request.url}`)?.clone())
  }

  put(request: Request, response: Response): Promise<void> {
    this.store.set(`${request.method}:${request.url}`, response.clone())
    return Promise.resolve()
  }
}
