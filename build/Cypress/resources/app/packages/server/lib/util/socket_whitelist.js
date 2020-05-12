"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var lodash_1 = __importDefault(require("lodash"));
var debug_1 = __importDefault(require("debug"));
var debug = debug_1.default('cypress:server:util:socket_whitelist');
/**
 * Utility to validate incoming, local socket connections against a list of
 * expected client TCP ports.
 */
var SocketWhitelist = /** @class */ (function () {
    function SocketWhitelist() {
        var _this = this;
        this.whitelistedLocalPorts = [];
        /**
         * Add a socket to the whitelist.
         */
        this.add = function (socket) {
            var localPort = socket.localPort;
            debug('whitelisting socket %o', { localPort: localPort });
            _this.whitelistedLocalPorts.push(localPort);
            socket.once('close', function () {
                debug('whitelisted socket closed, removing %o', { localPort: localPort });
                _this._remove(socket);
            });
        };
    }
    SocketWhitelist.prototype._remove = function (socket) {
        lodash_1.default.pull(this.whitelistedLocalPorts, socket.localPort);
    };
    /**
     * Is this socket that this request originated from whitelisted?
     */
    SocketWhitelist.prototype.isRequestWhitelisted = function (req) {
        var _a = req.socket, remotePort = _a.remotePort, remoteAddress = _a.remoteAddress;
        var isWhitelisted = this.whitelistedLocalPorts.includes(remotePort)
            && ['127.0.0.1', '::1'].includes(remoteAddress);
        debug('is incoming request whitelisted? %o', { isWhitelisted: isWhitelisted, reqUrl: req.url, remotePort: remotePort, remoteAddress: remoteAddress });
        return isWhitelisted;
    };
    return SocketWhitelist;
}());
exports.SocketWhitelist = SocketWhitelist;
