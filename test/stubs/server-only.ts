/**
 * Stand-in for the `server-only` marker package under Vitest.
 *
 * `server-only` exports an empty module under the `react-server` export condition and a
 * module that throws on import otherwise. Next sets that condition when compiling a Server
 * Component; plain Node does not, so without this alias every test that touches a
 * server-only module fails on import.
 *
 * Aliasing it away does not weaken anything: the guard is enforced by the bundler at build
 * time, and that is proven by building a client component that imports the module and
 * watching the build fail (25-progress.md), not by a unit test.
 */
export {}
