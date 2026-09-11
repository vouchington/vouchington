export interface AuthState<T> {
  isAvailable: boolean
  isLoaded: boolean
  login: () => Promise<T>
}
