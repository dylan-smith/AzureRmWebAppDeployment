import * as core from '@actions/core'
import * as fs from 'fs'
import * as util from 'util'
import * as path from 'path'

/**
 * Checks whether a path exists.
 * If the path does not exist, it will throw.
 *
 * @param     p         path to check
 * @param     name      name only used in error message to identify the path
 * @returns   void
 */
export function _checkPath(p: string, name: string): void {
  core.debug(`check path : ${p}`)
  if (!_exist(p)) {
    throw new Error(util.format('Not found %s: %s', name, p))
  }
}

/**
 * Returns whether a path exists.
 *
 * @param     filepath      path to check
 * @returns   boolean
 */
export function _exist(filepath: string): boolean {
  let result = false
  try {
    result = !!(filepath && fs.statSync(filepath) != null)
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      result = false
    } else {
      throw err
    }
  }
  return result
}

export function _isRooted(p: string): boolean {
  p = _normalizeSeparators(p)
  if (!p) {
    throw new Error('isRooted() parameter "p" cannot be empty')
  }

  if (process.platform === 'win32') {
    return (
      p.startsWith('\\') || /^[A-Z]:/i.test(p) // e.g. \ or \hello or \\hello
    ) // e.g. C: or C:\hello
  }

  return p.startsWith('/') // e.g. /hello
}

export function _normalizeSeparators(p: string): string {
  p = p || ''
  if (process.platform === 'win32') {
    // convert slashes on Windows
    p = p.replace(/\//g, '\\')

    // remove redundant slashes
    const isUnc = /^\\\\+[^\\]/.test(p) // e.g. \\hello
    return (isUnc ? '\\' : '') + p.replace(/\\\\+/g, '\\') // preserve leading // for UNC
  }

  // remove redundant slashes
  return p.replace(/\/\/+/g, '/')
}

export function _ensureRooted(root: string, p: string): string {
  if (!root) {
    throw new Error('ensureRooted() parameter "root" cannot be empty')
  }

  if (!p) {
    throw new Error('ensureRooted() parameter "p" cannot be empty')
  }

  if (_isRooted(p)) {
    return p
  }

  if (process.platform === 'win32' && root.match(/^[A-Z]:$/i)) {
    // e.g. C:
    return root + p
  }

  // ensure root ends with a separator
  if (
    root.endsWith('/') ||
    (process.platform === 'win32' && root.endsWith('\\'))
  ) {
    // root already ends with a separator
  } else {
    root += path.sep // append separator
  }

  return root + p
}

/**
 * Gets a variable value that is defined on the build/release definition or set at runtime.
 *
 * @param     name     name of the variable to get
 * @returns   string
 */
export function _getVariable(name: string): string | undefined {
  const key: string = _getVariableKey(name)
  const varval = process.env[key]

  core.debug(`${name}=${varval}`)
  return varval
}

export function _getVariableKey(name: string): string {
  if (!name) {
    throw new Error(util.format('%s not supplied', 'name'))
  }

  return name
    .replace(/\./g, '_')
    .replace(/ /g, '_')
    .toUpperCase()
}
