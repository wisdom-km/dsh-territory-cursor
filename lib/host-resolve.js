import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Host packages live inside app.asar. A plugin linked from another drive
 * cannot resolve the bare names, so build a file URL from the running executable.
 * @param {string} execPath
 * @param {string} packageName
 * @param {string} file
 */
export function hostModuleUrl(execPath, packageName, file) {
  const full = path.resolve(
    path.dirname(execPath),
    'resources',
    'app.asar',
    'dsh',
    'node_modules',
    '@deepseek-ai',
    packageName,
    'lib',
    file,
  )
  return pathToFileURL(full).href
}
