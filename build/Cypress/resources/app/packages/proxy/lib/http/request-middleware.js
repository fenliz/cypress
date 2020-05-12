"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var lodash_1 = __importDefault(require("lodash"));
var debug_1 = __importDefault(require("debug"));
var network_1 = require("../../../network");
var debug = debug_1.default('cypress:proxy:http:request-middleware');
var LogRequest = function () {
    debug('proxying request %o', {
        req: lodash_1.default.pick(this.req, 'method', 'proxiedUrl', 'headers'),
    });
    this.next();
};
var RedirectToClientRouteIfUnloaded = function () {
    // if we have an unload header it means our parent app has been navigated away
    // directly and we need to automatically redirect to the clientRoute
    if (this.req.cookies['__cypress.unload']) {
        this.res.redirect(this.config.clientRoute);
        return this.end();
    }
    this.next();
};
// TODO: is this necessary? it seems to be for requesting Cypress w/o the proxy,
// which isn't currently supported
var RedirectToClientRouteIfNotProxied = function () {
    // when you access cypress from a browser which has not had its proxy setup then
    // req.url will match req.proxiedUrl and we'll know to instantly redirect them
    // to the correct client route
    if (this.req.url === this.req.proxiedUrl && !this.getRemoteState().visiting) {
        // if we dont have a remoteState.origin that means we're initially requesting
        // the cypress app and we need to redirect to the root path that serves the app
        this.res.redirect(this.config.clientRoute);
        return this.end();
    }
    this.next();
};
var EndRequestsToBlacklistedHosts = function () {
    var blacklistHosts = this.config.blacklistHosts;
    if (blacklistHosts) {
        var matches = network_1.blacklist.matches(this.req.proxiedUrl, blacklistHosts);
        if (matches) {
            this.res.set('x-cypress-matched-blacklisted-host', matches);
            debug('blacklisting request %o', {
                url: this.req.proxiedUrl,
                matches: matches,
            });
            this.res.status(503).end();
            return this.end();
        }
    }
    this.next();
};
var MaybeEndRequestWithBufferedResponse = function () {
    var buffer = this.buffers.take(this.req.proxiedUrl);
    if (buffer) {
        debug('got a buffer %o', lodash_1.default.pick(buffer, 'url'));
        this.res.wantsInjection = 'full';
        return this.onResponse(buffer.response, buffer.stream);
    }
    this.next();
};
var StripUnsupportedAcceptEncoding = function () {
    // Cypress can only support plaintext or gzip, so make sure we don't request anything else
    var acceptEncoding = this.req.headers['accept-encoding'];
    if (acceptEncoding) {
        if (acceptEncoding.includes('gzip')) {
            this.req.headers['accept-encoding'] = 'gzip';
        }
        else {
            delete this.req.headers['accept-encoding'];
        }
    }
    this.next();
};
function reqNeedsBasicAuthHeaders(req, _a) {
    var auth = _a.auth, origin = _a.origin;
    //if we have auth headers, this request matches our origin, protection space, and the user has not supplied auth headers
    return auth && !req.headers['authorization'] && network_1.cors.urlMatchesOriginProtectionSpace(req.proxiedUrl, origin);
}
var MaybeSetBasicAuthHeaders = function () {
    var remoteState = this.getRemoteState();
    if (reqNeedsBasicAuthHeaders(this.req, remoteState)) {
        var auth = remoteState.auth;
        var base64 = Buffer.from(auth.username + ":" + auth.password).toString('base64');
        this.req.headers['authorization'] = "Basic " + base64;
    }
    this.next();
};
var SendRequestOutgoing = function () {
    var _this = this;
    var requestOptions = {
        timeout: this.config.responseTimeout,
        strictSSL: false,
        followRedirect: false,
        retryIntervals: [0, 100, 200, 200],
        url: this.req.proxiedUrl,
    };
    var _a = this.getRemoteState(), strategy = _a.strategy, origin = _a.origin, fileServer = _a.fileServer;
    if (strategy === 'file' && requestOptions.url.startsWith(origin)) {
        this.req.headers['x-cypress-authorization'] = this.getFileServerToken();
        requestOptions.url = requestOptions.url.replace(origin, fileServer);
    }
    var req = this.request.create(requestOptions);
    req.on('error', this.onError);
    req.on('response', function (incomingRes) { return _this.onResponse(incomingRes, req); });
    this.req.on('aborted', function () {
        debug('request aborted');
        req.abort();
    });
    // pipe incoming request body, headers to new request
    this.req.pipe(req);
    this.outgoingReq = req;
};
exports.default = {
    LogRequest: LogRequest,
    RedirectToClientRouteIfUnloaded: RedirectToClientRouteIfUnloaded,
    RedirectToClientRouteIfNotProxied: RedirectToClientRouteIfNotProxied,
    EndRequestsToBlacklistedHosts: EndRequestsToBlacklistedHosts,
    MaybeEndRequestWithBufferedResponse: MaybeEndRequestWithBufferedResponse,
    StripUnsupportedAcceptEncoding: StripUnsupportedAcceptEncoding,
    MaybeSetBasicAuthHeaders: MaybeSetBasicAuthHeaders,
    SendRequestOutgoing: SendRequestOutgoing,
};
