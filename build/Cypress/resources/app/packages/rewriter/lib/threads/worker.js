"use strict";
// this is designed to run as its own thread, managed by `threads.ts`
// WARNING: take care to not over-import modules here - the upfront
// mem/CPU cost is paid up to threads.MAX_WORKER_THREADS times
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var worker_threads_1 = require("worker_threads");
if (worker_threads_1.isMainThread) {
    throw new Error(__filename + " should only be run as a worker thread");
}
var js_1 = require("../js");
var html_1 = require("../html");
worker_threads_1.parentPort.postMessage(true);
var _idCounter = 0;
worker_threads_1.parentPort.on('message', function (req) {
    var startedAt = Date.now();
    function _deferSourceMapRewrite(deferredSourceMap) {
        var uniqueId = [worker_threads_1.threadId, _idCounter++].join('.');
        _reply({
            threadMs: _getThreadMs(),
            deferredSourceMap: __assign({ uniqueId: uniqueId }, deferredSourceMap),
        });
        return uniqueId;
    }
    function _reply(res) {
        req.port.postMessage(res);
    }
    function _getThreadMs() {
        return Date.now() - startedAt;
    }
    function _getOutput() {
        if (req.isHtml) {
            return html_1.rewriteHtmlJs(req.url, req.source, _deferSourceMapRewrite);
        }
        if (req.sourceMap) {
            return js_1.rewriteJsSourceMap(req.url, req.source, req.inputSourceMap);
        }
        return js_1.rewriteJs(req.url, req.source, _deferSourceMapRewrite);
    }
    try {
        var output = _getOutput();
        _reply({ output: output, threadMs: _getThreadMs() });
    }
    catch (error) {
        _reply({ error: error, threadMs: _getThreadMs() });
    }
    return req.port.close();
});
