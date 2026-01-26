// @ts-check

/**
 * Utility Functions Module
 * 
 * @module utils
 * @description Common utility functions used throughout the application.
 * This module contains helper functions that are needed by multiple modules
 * to avoid code duplication.
 */

const path = require('path');
const os = require('os');

// ============================================================================
// PATH UTILITIES
// ============================================================================

/**
 * Expands tilde (~) to user's home directory in file paths
 * 
 * This function handles the common pattern of using ~ in configuration files
 * to represent the user's home directory. It converts paths like ~/.aws/config
 * into their absolute equivalents.
 * 
 * @function expandHomeDir
 * @param {string} filepath - Path that may start with ~/
 * @returns {string} Absolute path with home directory expanded
 * 
 * @example
 * expandHomeDir('~/.aws/config') 
 * // => '/Users/username/.aws/config' (on macOS)
 * 
 * expandHomeDir('/absolute/path')
 * // => '/absolute/path' (unchanged)
 * 
 * expandHomeDir('relative/path')
 * // => 'relative/path' (unchanged)
 */
function expandHomeDir(filepath) {
  if (filepath.startsWith('~/')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  return filepath;
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  expandHomeDir,
};
