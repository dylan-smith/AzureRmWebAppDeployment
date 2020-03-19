declare module 'minimatch' {
  interface IOptions {
    /**
     * Dump a ton of stuff to stderr.
     *
     * @default false
     */
    debug?: boolean

    /**
     * Do not expand {a,b} and {1..3} brace sets.
     *
     * @default false
     */
    nobrace?: boolean

    /**
     * Disable ** matching against multiple folder names.
     *
     * @default false
     */
    noglobstar?: boolean

    /**
     * Allow patterns to match filenames starting with a period,
     * even if the pattern does not explicitly have a period in that spot.
     *
     * @default false
     */
    dot?: boolean

    /**
     * Disable "extglob" style patterns like +(a|b).
     *
     * @default false
     */
    noext?: boolean

    /**
     * Perform a case-insensitive match.
     *
     * @default false
     */
    nocase?: boolean

    /**
     * When a match is not found by minimatch.match,
     * return a list containing the pattern itself if this option is set.
     * Otherwise, an empty list is returned if there are no matches.
     *
     * @default false
     */
    nonull?: boolean

    /**
     * If set, then patterns without slashes will be matched against
     * the basename of the path if it contains slashes.
     *
     * @default false
     */
    matchBase?: boolean

    /**
     * Suppress the behavior of treating #
     * at the start of a pattern as a comment.
     *
     * @default false
     */
    nocomment?: boolean

    /**
     * Suppress the behavior of treating a leading ! character as negation.
     *
     * @default false
     */
    nonegate?: boolean

    /**
     * Returns from negate expressions the same as if they were not negated.
     * (Ie, true on a hit, false on a miss.)
     *
     * @default false
     */
    flipNegate?: boolean
  }

  interface IMinimatch {
    /**
     * The original pattern the minimatch object represents.
     */
    pattern: string

    /**
     * The options supplied to the constructor.
     */
    options: IOptions

    /**
     * A 2-dimensional array of regexp or string expressions.
     */
    set: (RegExp | string)[][] // (RegExp | string)[][]

    /**
     * A single regular expression expressing the entire pattern.
     * Created by the makeRe method.
     */
    regexp: RegExp

    /**
     * True if the pattern is negated.
     */
    negate: boolean

    /**
     * True if the pattern is a comment.
     */
    comment: boolean

    /**
     * True if the pattern is ""
     */
    empty: boolean

    /**
     * Generate the regexp member if necessary, and return it.
     * Will return false if the pattern is invalid.
     */
    makeRe(): RegExp // regexp or boolean

    /**
     * Return true if the filename matches the pattern, or false otherwise.
     */
    match(fname: string): boolean

    /**
     * Take a /-split filename, and match it against a single row in the regExpSet.
     * This method is mainly for internal use, but is exposed so that it can be used
     * by a glob-walker that needs to avoid excessive filesystem calls.
     */
    matchOne(files: string[], pattern: string[], partial: boolean): boolean

    /**
     * Deprecated. For internal use.
     *
     * @private
     */
    debug(): void

    /**
     * Deprecated. For internal use.
     *
     * @private
     */
    make(): void

    /**
     * Deprecated. For internal use.
     *
     * @private
     */
    parseNegate(): void

    /**
     * Deprecated. For internal use.
     *
     * @private
     */
    braceExpand(pattern: string, options: IOptions): string[]

    /**
     * Deprecated. For internal use.
     *
     * @private
     */
    parse(pattern: string, isSub?: boolean): void
  }

  function braceExpand(pattern: string, options?: IOptions): string[]

  function match(list: string[], pattern: string, options?: IOptions): string[]
}
