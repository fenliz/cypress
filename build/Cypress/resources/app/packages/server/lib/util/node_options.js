"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var child_process_1 = __importDefault(require("child_process"));
var debug_1 = __importDefault(require("debug"));
var debug = debug_1.default('cypress:server:util:node_options');
var NODE_OPTIONS = "--max-http-header-size=" + Math.pow(1024, 2) + " --http-parser=legacy";
/**
 * If Cypress was not launched via CLI, it may be missing certain startup
 * options. This checks that those startup options were applied.
 *
 * @returns {boolean} does Cypress have the expected NODE_OPTIONS?
 */
function needsOptions() {
    if ((process.env.NODE_OPTIONS || '').includes(NODE_OPTIONS)) {
        debug('NODE_OPTIONS check passed, not forking %o', { NODE_OPTIONS: process.env.NODE_OPTIONS });
        return false;
    }
    if (typeof require.main === 'undefined') {
        debug('require.main is undefined, this should not happen normally, not forking');
        return false;
    }
    return true;
}
exports.needsOptions = needsOptions;
/**
 * Fork the current process using the good NODE_OPTIONS and pipe stdio
 * through the current process. On exit, copy the error code too.
 */
function forkWithCorrectOptions() {
    // this should only happen when running from global mode, when the CLI couldn't set the NODE_OPTIONS
    process.env.ORIGINAL_NODE_OPTIONS = process.env.NODE_OPTIONS || '';
    process.env.NODE_OPTIONS = NODE_OPTIONS + " " + process.env.ORIGINAL_NODE_OPTIONS;
    debug('NODE_OPTIONS check failed, forking %o', {
        NODE_OPTIONS: process.env.NODE_OPTIONS,
        ORIGINAL_NODE_OPTIONS: process.env.ORIGINAL_NODE_OPTIONS,
    });
    child_process_1.default.spawn(process.execPath, process.argv.slice(1), { stdio: 'inherit' })
        .on('error', function () { })
        .on('exit', function (code) {
        process.exit(code);
    });
}
exports.forkWithCorrectOptions = forkWithCorrectOptions;
/**
 * Once the Electron process is launched, restore the user's original NODE_OPTIONS
 * environment variables from before the CLI added extra NODE_OPTIONS.
 *
 * This way, any `node` processes launched by Cypress will retain the user's
 * `NODE_OPTIONS` without unexpected modificiations that could cause issues with
 * user code.
 */
function restoreOriginalOptions() {
    // @ts-ignore
    if (!process.versions || !process.versions.electron) {
        debug('not restoring NODE_OPTIONS since not yet in Electron');
        return;
    }
    debug('restoring NODE_OPTIONS %o', {
        NODE_OPTIONS: process.env.NODE_OPTIONS,
        ORIGINAL_NODE_OPTIONS: process.env.ORIGINAL_NODE_OPTIONS,
    });
    process.env.NODE_OPTIONS = process.env.ORIGINAL_NODE_OPTIONS || '';
}
exports.restoreOriginalOptions = restoreOriginalOptions;
