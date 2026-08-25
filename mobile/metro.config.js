/**
 * Monorepo wiring — the app imports the contract schemas and the message catalogues from
 * the web's `src/`, so Metro must watch the workspace root and resolve the shared aliases.
 *
 * The aliases come from `contract-map.json`, which is the SINGLE source both this file and
 * `tsconfig.json` must agree with — `test/mobile-boundary.test.ts` asserts the tsconfig
 * side, because a divergence between the two is the worst kind of bug: `tsc` passes against
 * one mapping and the device resolves the other, so the pipeline is green and the app
 * crashes on launch. tsconfig cannot import a module, so the JSON is the shared list and
 * the test is its enforcement — the `reference-dirs.mjs` arrangement, again.
 */
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const contractMap = require('./contract-map.json')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)
config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

config.resolver.resolveRequest = (context, moduleName, platform) => {
  for (const [pattern, target] of Object.entries(contractMap)) {
    const prefix = pattern.slice(0, -1) // '@contracts/*' -> '@contracts/'
    if (moduleName.startsWith(prefix)) {
      const rest = moduleName.slice(prefix.length)
      const resolved = path.join(workspaceRoot, target.replace('*', rest))
      return context.resolveRequest(context, resolved, platform)
    }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
