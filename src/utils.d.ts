/**
 * Utility Functions Module Type Definitions
 *
 * @module utils
 */

/**
 * Expands tilde (~) in file paths to user's home directory
 *
 * @param filePath - Path that may contain ~ for home directory
 * @returns Expanded path with full home directory
 *
 * @example
 * ```typescript
 * expandHomeDir('~/.aws/config');
 * // => '/Users/username/.aws/config' (macOS/Linux)
 * ```
 */
export function expandHomeDir(filePath: string): string;
