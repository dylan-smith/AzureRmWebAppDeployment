import * as core from '@actions/core'
import * as im from './internal'
import * as fs from 'fs'
import * as util from 'util'
import * as path from 'path'
import * as minimatch from 'minimatch'
import * as childProcess from 'child_process'
import * as shell from 'shelljs'
import * as trm from './toolrunner'

export const getVariable = im._getVariable
export const exist = im._exist
export const which = im._which

/**
 * Gets the value of an input and converts to a bool.  Convenience.
 * If required is true and the value is not set, it will throw.
 * If required is false and the value is not set, returns false.
 *
 * @param     name     name of the bool input to get
 * @param     options  whether input is required.  optional, defaults to false
 * @returns   boolean
 */
export function getBoolInput(
  name: string,
  options?: core.InputOptions
): boolean {
  return (core.getInput(name, options) || '').toUpperCase() === 'TRUE'
}

/**
 * Gets the value of a path input
 * It will be quoted for you if it isn't already and contains spaces
 * If required is true and the value is not set, it will throw.
 * If check is true and the path does not exist, it will throw.
 *
 * @param     name      name of the input to get
 * @param     options   whether input is required.  optional, defaults to false
 * @param     check     whether path is checked.  optional, defaults to false
 * @returns   string
 */
export function getPathInput(
  name: string,
  options?: core.InputOptions,
  check?: boolean
): string {
  const inval = core.getInput(name, options)
  if (inval) {
    if (check) {
      im._checkPath(inval, name)
    }
  }

  return inval
}

/**
 * Gets the value of an input and splits the value using a delimiter (space, comma, etc).
 * Empty values are removed.  This function is useful for splitting an input containing a simple
 * list of items - such as build targets.
 * IMPORTANT: Do not use this function for splitting additional args!  Instead use argString(), which
 * follows normal argument splitting rules and handles values encapsulated by quotes.
 * If required is true and the value is not set, it will throw.
 *
 * @param     name     name of the input to get
 * @param     delim    delimiter to split on
 * @param     required whether input is required.  optional, defaults to false
 * @returns   string[]
 */
export function getDelimitedInput(
  name: string,
  delim: string,
  options?: core.InputOptions
): string[] {
  const inputVal = core.getInput(name, options)
  if (!inputVal) {
    return []
  }

  const result: string[] = []
  for (const x of inputVal.split(delim)) {
    if (x) {
      result.push(x)
    }
  }

  return result
}

/**
 * Interface for FindOptions
 * Contains properties to control whether to follow symlinks
 */
export interface FindOptions {
  /**
   * When true, broken symbolic link will not cause an error.
   */
  allowBrokenSymbolicLinks: boolean

  /**
   * Equivalent to the -H command line option. Indicates whether to traverse descendants if
   * the specified path is a symbolic link directory. Does not cause nested symbolic link
   * directories to be traversed.
   */
  followSpecifiedSymbolicLink: boolean

  /**
   * Equivalent to the -L command line option. Indicates whether to traverse descendants of
   * symbolic link directories.
   */
  followSymbolicLinks: boolean
}

function _getDefaultFindOptions(): FindOptions {
  return {
    allowBrokenSymbolicLinks: false,
    followSpecifiedSymbolicLink: true,
    followSymbolicLinks: true
  }
}

function _debugFindOptions(options: FindOptions): void {
  core.debug(
    `findOptions.allowBrokenSymbolicLinks: '${options.allowBrokenSymbolicLinks}'`
  )
  core.debug(
    `findOptions.followSpecifiedSymbolicLink: '${options.followSpecifiedSymbolicLink}'`
  )
  core.debug(
    `findOptions.followSymbolicLinks: '${options.followSymbolicLinks}'`
  )
}

class FindItem {
  path: string
  level: number

  constructor(filepath: string, level: number) {
    this.path = filepath
    this.level = level
  }
}

/**
 * Recursively finds all paths a given path. Returns an array of paths.
 *
 * @param     findPath  path to search
 * @param     options   optional. defaults to { followSymbolicLinks: true }. following soft links is generally appropriate unless deleting files.
 * @returns   string[]
 */
export function find(findPath: string, options?: FindOptions): string[] {
  if (!findPath) {
    core.debug('no path specified')
    return []
  }

  // normalize the path, otherwise the first result is inconsistently formatted from the rest of the results
  // because path.join() performs normalization.
  findPath = path.normalize(findPath)

  // debug trace the parameters
  core.debug(`findPath: '${findPath}'`)
  options = options || _getDefaultFindOptions()
  _debugFindOptions(options)

  // return empty if not exists
  try {
    fs.lstatSync(findPath)
  } catch (err) {
    if (err.code === 'ENOENT') {
      core.debug('0 results')
      return []
    }

    throw err
  }

  try {
    const result: string[] = []

    // push the first item
    const stack: FindItem[] = [new FindItem(findPath, 1)]
    const traversalChain: string[] = [] // used to detect cycles

    while (stack.length) {
      // pop the next item and push to the result array
      const item = stack.pop() // non-null because `stack.length` was truthy
      if (item) {
        result.push(item.path)

        // stat the item.  the stat info is used further below to determine whether to traverse deeper
        //
        // stat returns info about the target of a symlink (or symlink chain),
        // lstat returns info about a symlink itself
        let stats: fs.Stats
        if (options.followSymbolicLinks) {
          try {
            // use stat (following all symlinks)
            stats = fs.statSync(item.path)
          } catch (err) {
            if (err.code === 'ENOENT' && options.allowBrokenSymbolicLinks) {
              // fallback to lstat (broken symlinks allowed)
              stats = fs.lstatSync(item.path)
              core.debug(`  ${item.path} (broken symlink)`)
            } else {
              throw err
            }
          }
        } else if (options.followSpecifiedSymbolicLink && result.length === 1) {
          try {
            // use stat (following symlinks for the specified path and this is the specified path)
            stats = fs.statSync(item.path)
          } catch (err) {
            if (err.code === 'ENOENT' && options.allowBrokenSymbolicLinks) {
              // fallback to lstat (broken symlinks allowed)
              stats = fs.lstatSync(item.path)
              core.debug(`  ${item.path} (broken symlink)`)
            } else {
              throw err
            }
          }
        } else {
          // use lstat (not following symlinks)
          stats = fs.lstatSync(item.path)
        }

        // note, isDirectory() returns false for the lstat of a symlink
        if (stats.isDirectory()) {
          core.debug(`  ${item.path} (directory)`)

          if (options.followSymbolicLinks) {
            // get the realpath
            const realPath: string = fs.realpathSync(item.path)

            // fixup the traversal chain to match the item level
            while (traversalChain.length >= item.level) {
              traversalChain.pop()
            }

            // test for a cycle
            if (traversalChain.some((x: string) => x === realPath)) {
              core.debug('    cycle detected')
              continue
            }

            // update the traversal chain
            traversalChain.push(realPath)
          }

          // push the child items in reverse onto the stack
          const childLevel: number = item.level + 1
          const childItems: FindItem[] = fs
            .readdirSync(item.path)
            .map(
              (childName: string) =>
                new FindItem(path.join(item.path, childName), childLevel)
            )
          for (let i = childItems.length - 1; i >= 0; i--) {
            stack.push(childItems[i])
          }
        } else {
          core.debug(`  ${item.path} (file)`)
        }
      }
    }

    core.debug(`${result.length} results`)
    return result
  } catch (err) {
    throw new Error(util.format('Failed %s: %s', 'find', err.message))
  }
}

export interface MatchOptions {
  debug?: boolean
  nobrace?: boolean
  noglobstar?: boolean
  dot?: boolean
  noext?: boolean
  nocase?: boolean
  nonull?: boolean
  matchBase?: boolean
  nocomment?: boolean
  nonegate?: boolean
  flipNegate?: boolean
}

function _debugMatchOptions(options: MatchOptions): void {
  core.debug(`matchOptions.debug: '${options.debug}'`)
  core.debug(`matchOptions.nobrace: '${options.nobrace}'`)
  core.debug(`matchOptions.noglobstar: '${options.noglobstar}'`)
  core.debug(`matchOptions.dot: '${options.dot}'`)
  core.debug(`matchOptions.noext: '${options.noext}'`)
  core.debug(`matchOptions.nocase: '${options.nocase}'`)
  core.debug(`matchOptions.nonull: '${options.nonull}'`)
  core.debug(`matchOptions.matchBase: '${options.matchBase}'`)
  core.debug(`matchOptions.nocomment: '${options.nocomment}'`)
  core.debug(`matchOptions.nonegate: '${options.nonegate}'`)
  core.debug(`matchOptions.flipNegate: '${options.flipNegate}'`)
}

function _getDefaultMatchOptions(): MatchOptions {
  return {
    debug: false,
    nobrace: true,
    noglobstar: false,
    dot: true,
    noext: false,
    nocase: process.platform === 'win32',
    nonull: false,
    matchBase: false,
    nocomment: false,
    nonegate: false,
    flipNegate: false
  }
}

export function _cloneMatchOptions(matchOptions: MatchOptions): MatchOptions {
  return {
    debug: matchOptions.debug,
    nobrace: matchOptions.nobrace,
    noglobstar: matchOptions.noglobstar,
    dot: matchOptions.dot,
    noext: matchOptions.noext,
    nocase: matchOptions.nocase,
    nonull: matchOptions.nonull,
    matchBase: matchOptions.matchBase,
    nocomment: matchOptions.nocomment,
    nonegate: matchOptions.nonegate,
    flipNegate: matchOptions.flipNegate
  }
}

/**
 * Applies glob patterns to a list of paths. Supports interleaved exclude patterns.
 *
 * @param  list         array of paths
 * @param  patterns     patterns to apply. supports interleaved exclude patterns.
 * @param  patternRoot  optional. default root to apply to unrooted patterns. not applied to basename-only patterns when matchBase:true.
 * @param  options      optional. defaults to { dot: true, nobrace: true, nocase: process.platform == 'win32' }.
 */
export function match(
  list: string[],
  patterns: string[] | string,
  patternRoot?: string,
  options?: MatchOptions
): string[] {
  // trace parameters
  core.debug(`patternRoot: '${patternRoot}'`)
  options = options || _getDefaultMatchOptions() // default match options
  _debugMatchOptions(options)

  // convert pattern to an array
  if (typeof patterns === 'string') {
    patterns = [patterns]
  }

  // hashtable to keep track of matches
  const map: {[item: string]: boolean} = {}

  const originalOptions = options
  for (let pattern of patterns) {
    core.debug(`pattern: '${pattern}'`)

    // trim and skip empty
    pattern = (pattern || '').trim()
    if (!pattern) {
      core.debug('skipping empty pattern')
      continue
    }

    // clone match options
    options = _cloneMatchOptions(originalOptions)

    // skip comments
    if (!options.nocomment && pattern.startsWith('#')) {
      core.debug('skipping comment')
      continue
    }

    // set nocomment - brace expansion could result in a leading '#'
    options.nocomment = true

    // determine whether pattern is include or exclude
    let negateCount = 0
    if (!options.nonegate) {
      while (pattern.charAt(negateCount) === '!') {
        negateCount++
      }

      pattern = pattern.substring(negateCount) // trim leading '!'
      if (negateCount) {
        core.debug(`trimmed leading '!'. pattern: '${pattern}'`)
      }
    }

    const isIncludePattern =
      negateCount === 0 ||
      (negateCount % 2 === 0 && !options.flipNegate) ||
      (negateCount % 2 === 1 && options.flipNegate)

    // set nonegate - brace expansion could result in a leading '!'
    options.nonegate = true
    options.flipNegate = false

    // expand braces - required to accurately root patterns
    let expanded: string[]
    const preExpanded: string = pattern
    if (options.nobrace) {
      expanded = [pattern]
    } else {
      // convert slashes on Windows before calling braceExpand(). unfortunately this means braces cannot
      // be escaped on Windows, this limitation is consistent with current limitations of minimatch (3.0.3).
      core.debug('expanding braces')
      const convertedPattern =
        process.platform === 'win32' ? pattern.replace(/\\/g, '/') : pattern
      expanded = minimatch.braceExpand(convertedPattern)
    }

    // set nobrace
    options.nobrace = true

    for (let pat of expanded) {
      if (expanded.length !== 1 || pat !== preExpanded) {
        core.debug(`pattern: '${pat}'`)
      }

      // trim and skip empty
      pat = (pat || '').trim()
      if (!pat) {
        core.debug('skipping empty pattern')
        continue
      }

      // root the pattern when all of the following conditions are true:
      if (
        patternRoot && // patternRoot supplied
        im._isRooted(pat) && // AND pattern not rooted
        // AND matchBase:false or not basename only
        (!options.matchBase ||
          (process.platform === 'win32'
            ? pat.replace(/\\/g, '/')
            : pat
          ).includes('/'))
      ) {
        pat = im._ensureRooted(patternRoot, pat)
        core.debug(`rooted pattern: '${pat}'`)
      }

      if (isIncludePattern) {
        // apply the pattern
        core.debug('applying include pattern against original list')
        const matchResults: string[] = minimatch.match(list, pat, options)
        core.debug(`${matchResults.length} matches`)

        // union the results
        for (const matchResult of matchResults) {
          map[matchResult] = true
        }
      } else {
        // apply the pattern
        core.debug('applying exclude pattern against original list')
        const matchResults: string[] = minimatch.match(list, pat, options)
        core.debug(`${matchResults.length} matches`)

        // substract the results
        for (const matchResult of matchResults) {
          delete map[matchResult]
        }
      }
    }
  }

  // return a filtered version of the original list (preserves order and prevents duplication)
  const result: string[] = list.filter((item: string) =>
    map.hasOwnProperty(item)
  )
  core.debug(`${result.length} final results`)
  return result
}

/**
 * Remove a path recursively with force
 *
 * @param     inputPath path to remove
 * @throws    when the file or directory exists but could not be deleted.
 */
export function rmRF(inputPath: string): void {
  core.debug(`rm -rf ${inputPath}`)

  if (getPlatform() === Platform.Windows) {
    // Node doesn't provide a delete operation, only an unlink function. This means that if the file is being used by another
    // program (e.g. antivirus), it won't be deleted. To address this, we shell out the work to rd/del.
    try {
      if (fs.statSync(inputPath).isDirectory()) {
        core.debug(`removing directory ${inputPath}`)
        childProcess.execSync(`rd /s /q "${inputPath}"`)
      } else {
        core.debug(`removing file ${inputPath}`)
        childProcess.execSync(`del /f /a "${inputPath}"`)
      }
    } catch (err) {
      // if you try to delete a file that doesn't exist, desired result is achieved
      // other errors are valid
      if (err.code !== 'ENOENT') {
        throw new Error(util.format('Failed %s: %s', 'rmRF', err.message))
      }
    }

    // Shelling out fails to remove a symlink folder with missing source, this unlink catches that
    try {
      fs.unlinkSync(inputPath)
    } catch (err) {
      // if you try to delete a file that doesn't exist, desired result is achieved
      // other errors are valid
      if (err.code !== 'ENOENT') {
        throw new Error(util.format('Failed %s: %s', 'rmRF', err.message))
      }
    }
  } else {
    // get the lstats in order to workaround a bug in shelljs@0.3.0 where symlinks
    // with missing targets are not handled correctly by "rm('-rf', path)"
    let lstats: fs.Stats
    try {
      lstats = fs.lstatSync(inputPath)
    } catch (err) {
      // if you try to delete a file that doesn't exist, desired result is achieved
      // other errors are valid
      if (err.code === 'ENOENT') {
        return
      }

      throw new Error(util.format('Failed %s: %s', 'rmRF', err.message))
    }

    if (lstats.isDirectory()) {
      core.debug('removing directory')
      shell.rm('-rf', inputPath)
      const errMsg: string = shell.error()
      if (errMsg) {
        throw new Error(util.format('Failed %s: %s', 'rmRF', errMsg))
      }

      return
    }

    core.debug('removing file')
    try {
      fs.unlinkSync(inputPath)
    } catch (err) {
      throw new Error(util.format('Failed %s: %s', 'rmRF', err.message))
    }
  }
}

/**
 * Determine the operating system the build agent is running on.
 * @returns {Platform}
 * @throws {Error} Platform is not supported by our agent
 */
export function getPlatform(): Platform {
  switch (process.platform) {
    case 'win32':
      return Platform.Windows
    case 'darwin':
      return Platform.MacOS
    case 'linux':
      return Platform.Linux
    default:
      throw Error(util.format('Platform not supported: %s', process.platform))
  }
}

/** Platforms supported by our build agent */
export enum Platform {
  Windows,
  MacOS,
  Linux
}

/**
 * Exec a tool.  Convenience wrapper over ToolRunner to exec with args in one call.
 * Output will be streamed to the live console.
 * Returns promise with return code
 *
 * @param     tool     path to tool to exec
 * @param     args     an arg string or array of args
 * @param     options  optional exec options.  See IExecOptions
 * @returns   number
 */
export async function exec(
  tool: string,
  args: string | string[],
  options?: trm.IExecOptions
): Promise<number> {
  const tr: trm.ToolRunner = createToolRunner(tool)
  tr.on('debug', (data: string) => {
    core.debug(data)
  })

  if (args) {
    if (args instanceof Array) {
      tr.arg(args)
    } else if (typeof args === 'string') {
      tr.line(args)
    }
  }
  return tr.exec(options)
}

/**
 * Convenience factory to create a ToolRunner.
 *
 * @param     tool     path to tool to exec
 * @returns   ToolRunner
 */
export function tool(toolPath: string) {
  let tr: trm.ToolRunner = new trm.ToolRunner(toolPath)
  tr.on('debug', (message: string) => {
    core.debug(message)
  })

  return tr
}

/**
 * Exec a tool synchronously.  Convenience wrapper over ToolRunner to execSync with args in one call.
 * Output will be *not* be streamed to the live console.  It will be returned after execution is complete.
 * Appropriate for short running tools
 * Returns IExecResult with output and return code
 *
 * @param     tool     path to tool to exec
 * @param     args     an arg string or array of args
 * @param     options  optional exec options.  See IExecSyncOptions
 * @returns   IExecSyncResult
 */
export function execSync(
  toolPath: string,
  args: string | string[],
  options?: trm.IExecSyncOptions
): trm.IExecSyncResult {
  let tr: trm.ToolRunner = tool(toolPath)
  tr.on('debug', (data: string) => {
    core.debug(data)
  })

  if (args) {
    if (args instanceof Array) {
      tr.arg(args)
    } else if (typeof args === 'string') {
      tr.line(args)
    }
  }

  return tr.execSync(options)
}

/**
 * Convenience factory to create a ToolRunner.
 *
 * @param     tool     path to tool to exec
 * @returns   ToolRunner
 */
export function createToolRunner(tool: string): trm.ToolRunner {
  const tr: trm.ToolRunner = new trm.ToolRunner(tool)
  tr.on('debug', (message: string) => {
    core.debug(message)
  })

  return tr
}
