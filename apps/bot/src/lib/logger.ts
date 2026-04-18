export function logScope(scope: string, message: string): void {
  console.log(`[${scope}] ${message}`)
}

export function logError(scope: string, error: unknown): void {
  const text =
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  console.error(`[${scope}]`, text)
}
