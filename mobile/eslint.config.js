// eslint-config-expo carries the React Native environment (globals, platform rules); the
// root config deliberately ignores mobile/** because the two environments disagree about
// almost everything a linter checks (JSX runtime, globals, import resolution).
const expoConfig = require('eslint-config-expo/flat')

module.exports = [...expoConfig, { ignores: ['node_modules/**', '.expo/**'] }]
