export function reportError(scope: string, error: unknown): void {
  console.error(`[${scope}]`, error);
}
