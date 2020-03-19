import * as core from '@actions/core'
import * as path from 'path'
import * as os from 'os'
import * as tl from '../task-lib/task'

function firstWildcardIndex(str: string): number {
  const idx = str.indexOf('*')

  const idxOfWildcard = str.indexOf('?')
  if (idxOfWildcard > -1) {
    return idx > -1 ? Math.min(idx, idxOfWildcard) : idxOfWildcard
  }

  return idx
}

export function findfiles(filepath: string): string[] {
  core.debug(`Finding files matching input: ${filepath}`)

  let filesList: string[]
  if (!filepath.includes('*') && !filepath.includes('?')) {
    // No pattern found, check literal path to a single file
    if (tl.exist(filepath)) {
      filesList = [filepath]
    } else {
      core.debug(
        `No matching files were found with search pattern: ${filepath}`
      )
      return []
    }
  } else {
    // Find app files matching the specified pattern
    core.debug(`Matching glob pattern: ${filepath}`)

    // First find the most complete path without any matching patterns
    const idx = firstWildcardIndex(filepath)
    core.debug(`Index of first wildcard: ${idx}`)
    const slicedPath = filepath.slice(0, idx)
    let findPathRoot = path.dirname(slicedPath)
    if (slicedPath.endsWith('\\') || slicedPath.endsWith('/')) {
      findPathRoot = slicedPath
    }

    core.debug(`find root dir: ${findPathRoot}`)

    // Now we get a list of all files under this root
    const allFiles = tl.find(findPathRoot)

    // Now matching the pattern against all files
    filesList = tl.match(allFiles, filepath, '', {
      matchBase: true,
      nocase: !!os.type().match(/^Win/)
    })

    // Fail if no matching files were found
    if (!filesList || filesList.length === 0) {
      core.debug(
        `No matching files were found with search pattern: ${filepath}`
      )
      return []
    }
  }
  return filesList
}

export function getFileNameFromPath(
  filePath: string,
  extension?: string
): string {
  const isWindows = os.type().match(/^Win/)
  let fileName: string
  if (isWindows) {
    fileName = path.win32.basename(filePath, extension)
  } else {
    fileName = path.posix.basename(filePath, extension)
  }

  return fileName
}
