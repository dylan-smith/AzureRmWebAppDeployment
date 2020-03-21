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

/**
 * Returns path of a tool had the tool actually been invoked.  Resolves via paths.
 * If you check and the tool does not exist, it will throw.
 *
 * @param     tool       name of the tool
 * @param     check      whether to check if tool exists
 * @returns   string
 */
export function _which(tool: string, check?: boolean): string {
  if (!tool) {
    throw new Error("parameter 'tool' is required")
  }

  // recursive when check=true
  if (check) {
    const result: string = _which(tool, false)
    if (result) {
      return result
    } else {
      if (process.platform === 'win32') {
        throw new Error(
          util.format(
            "Unable to locate executable file: '%s'. Please verify either the file path exists or the file can be found within a directory specified by the PATH environment variable. Also verify the file has a valid extension for an executable file.",
            tool
          )
        )
      } else {
        throw new Error(
          util.format(
            "Unable to locate executable file: '%s'. Please verify either the file path exists or the file can be found within a directory specified by the PATH environment variable. Also check the file mode to verify the file is executable.",
            tool
          )
        )
      }
    }
  }

  core.debug(`which '${tool}'`)
  try {
    // build the list of extensions to try
    const extensions: string[] = []
    if (process.platform === 'win32' && process.env['PATHEXT']) {
      for (const extension of process.env['PATHEXT'].split(path.delimiter)) {
        if (extension) {
          extensions.push(extension)
        }
      }
    }

    // if it's rooted, return it if exists. otherwise return empty.
    if (_isRooted(tool)) {
      const filePath: string = _tryGetExecutablePath(tool, extensions)
      if (filePath) {
        core.debug(`found: '${filePath}'`)
        return filePath
      }

      core.debug('not found')
      return ''
    }

    // if any path separators, return empty
    if (
      tool.includes('/') ||
      (process.platform === 'win32' && tool.includes('\\'))
    ) {
      core.debug('not found')
      return ''
    }

    // build the list of directories
    //
    // Note, technically "where" checks the current directory on Windows. From a task lib perspective,
    // it feels like we should not do this. Checking the current directory seems like more of a use
    // case of a shell, and the which() function exposed by the task lib should strive for consistency
    // across platforms.
    const directories: string[] = []
    if (process.env['PATH']) {
      for (const p of process.env['PATH'].split(path.delimiter)) {
        if (p) {
          directories.push(p)
        }
      }
    }

    // return the first match
    for (const directory of directories) {
      const filePath = _tryGetExecutablePath(
        directory + path.sep + tool,
        extensions
      )
      if (filePath) {
        core.debug(`found: '${filePath}'`)
        return filePath
      }
    }

    core.debug('not found')
    return ''
  } catch (err) {
    throw new Error(util.format('Failed %s: %s', 'which', err.message))
  }
}

/**
 * Best effort attempt to determine whether a file exists and is executable.
 * @param filePath    file path to check
 * @param extensions  additional file extensions to try
 * @return if file exists and is executable, returns the file path. otherwise empty string.
 */
function _tryGetExecutablePath(filePath: string, extensions: string[]): string {
  try {
    // test file exists
    const stats: fs.Stats = fs.statSync(filePath)
    if (stats.isFile()) {
      if (process.platform === 'win32') {
        // on Windows, test for valid extension
        const fileName = path.basename(filePath)
        const dotIndex = fileName.lastIndexOf('.')
        if (dotIndex >= 0) {
          const upperExt = fileName.substr(dotIndex).toUpperCase()
          if (
            extensions.some(validExt => validExt.toUpperCase() === upperExt)
          ) {
            return filePath
          }
        }
      } else {
        if (isUnixExecutable(stats)) {
          return filePath
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      core.debug(
        `Unexpected error attempting to determine if executable file exists '${filePath}': ${err}`
      )
    }
  }

  // try each extension
  const originalFilePath = filePath
  for (const extension of extensions) {
    filePath = originalFilePath + extension
    try {
      const stats: fs.Stats = fs.statSync(filePath)
      if (stats.isFile()) {
        if (process.platform === 'win32') {
          // preserve the case of the actual file (since an extension was appended)
          try {
            const directory = path.dirname(filePath)
            const upperName = path.basename(filePath).toUpperCase()
            for (const actualName of fs.readdirSync(directory)) {
              if (upperName === actualName.toUpperCase()) {
                filePath = path.join(directory, actualName)
                break
              }
            }
          } catch (err) {
            core.debug(
              `Unexpected error attempting to determine the actual case of the file '${filePath}': ${err}`
            )
          }

          return filePath
        } else {
          if (isUnixExecutable(stats)) {
            return filePath
          }
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        core.debug(
          `Unexpected error attempting to determine if executable file exists '${filePath}': ${err}`
        )
      }
    }
  }

  return ''
}

// on Mac/Linux, test the execute bit
//     R   W  X  R  W X R W X
//   256 128 64 32 16 8 4 2 1
function isUnixExecutable(stats: fs.Stats): boolean {
  return (
    (stats.mode & 1) > 0 ||
    ((stats.mode & 8) > 0 && stats.gid === process.getgid()) ||
    ((stats.mode & 64) > 0 && stats.uid === process.getuid())
  )
}
