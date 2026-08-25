/**
 * Monorepo wiring — the app imports the contract schemas and the message catalogues from
 * the web's `src/` (see tsconfig `paths`), so Metro must watch the workspace root and
 * resolve hoisted packages from both node_modules.
 */
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)
config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.extraNodeModules = {
  '@contracts': path.resolve(workspaceRoot, 'src/modules'),
  '@messages': path.resolve(workspaceRoot, 'src/i18n/messages'),
}

module.exports = config
