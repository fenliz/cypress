"use strict";
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var lodash_1 = __importDefault(require("lodash"));
var originalEmitWarning = process.emitWarning;
var suppressed = false;
/**
 * Don't emit the NODE_TLS_REJECT_UNAUTHORIZED warning while
 * we work on proper SSL verification.
 * https://github.com/cypress-io/cypress/issues/5248
 */
function suppress() {
    if (suppressed) {
        return;
    }
    suppressed = true;
    process.emitWarning = function (warning) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        if (lodash_1.default.isString(warning) && lodash_1.default.includes(warning, 'NODE_TLS_REJECT_UNAUTHORIZED')) {
            // node will only emit the warning once
            // https://github.com/nodejs/node/blob/82f89ec8c1554964f5029fab1cf0f4fad1fa55a8/lib/_tls_wrap.js#L1378-L1384
            process.emitWarning = originalEmitWarning;
            return;
        }
        return originalEmitWarning.call.apply(originalEmitWarning, __spreadArrays([process, warning], args));
    };
}
exports.suppress = suppress;
