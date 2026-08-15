/**
 * Server startup hook. Next calls `register()` once per server process — `next dev`,
 * `next start`, and the worker entrypoint that shares this image
 * (`23-deployment-and-environments.md` §Runtime) — and never during `next build`.
 *
 * That is exactly where configuration validation belongs: §Configuration requires a
 * missing or malformed variable to fail **startup**, and an image is built once with no
 * production secrets present but started many times with them.
 *
 * There is no bypass flag. If this throws, the process has no valid configuration and
 * should not serve traffic.
 */
export async function register(): Promise<void> {
  // The Edge runtime has neither the full env nor a use for it; only validate on Node.
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  // Dynamic, so the module — and its parse — is evaluated inside this hook rather than
  // when the instrumentation file is first loaded.
  await import('./shared/config/env')
}
