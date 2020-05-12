"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var bluebird_1 = __importDefault(require("bluebird"));
var lodash_1 = require("lodash");
var os = __importStar(require("os"));
var ramda_1 = require("ramda");
var browsers_1 = require("./browsers");
var darwinHelper = __importStar(require("./darwin"));
var errors_1 = require("./errors");
var linuxHelper = __importStar(require("./linux"));
var log_1 = require("./log");
var windowsHelper = __importStar(require("./windows"));
// TODO: make this function NOT change its argument
exports.setMajorVersion = function (browser) {
    if (browser.version) {
        browser.majorVersion = browser.version.split('.')[0];
        log_1.log('browser %s version %s major version %s', browser.name, browser.version, browser.majorVersion);
        if (browser.majorVersion) {
            browser.majorVersion = parseInt(browser.majorVersion);
        }
    }
    return browser;
};
var helpers = {
    darwin: darwinHelper,
    linux: linuxHelper,
    win32: windowsHelper,
};
function getHelper(platform) {
    return helpers[platform || os.platform()];
}
function lookup(platform, browser) {
    log_1.log('looking up %s on %s platform', browser.name, platform);
    var helper = getHelper(platform);
    if (!helper) {
        throw new Error("Cannot lookup browser " + browser.name + " on " + platform);
    }
    return helper.detect(browser);
}
/**
 * Try to detect a single browser definition, which may dispatch multiple `checkOneBrowser` calls,
 * one for each binary. If Windows is detected, only one `checkOneBrowser` will be called, because
 * we don't use the `binary` field on Windows.
 */
function checkBrowser(browser) {
    if (Array.isArray(browser.binary) && os.platform() !== 'win32') {
        return bluebird_1.default.map(browser.binary, function (binary) {
            return checkOneBrowser(lodash_1.extend({}, browser, { binary: binary }));
        });
    }
    return bluebird_1.default.map([browser], checkOneBrowser);
}
function checkOneBrowser(browser) {
    var platform = os.platform();
    var pickBrowserProps = ramda_1.pick([
        'name',
        'family',
        'channel',
        'displayName',
        'type',
        'version',
        'path',
        'profilePath',
        'custom',
        'warning',
        'info',
    ]);
    var logBrowser = function (props) {
        log_1.log('setting major version for %j', props);
    };
    var failed = function (err) {
        if (err.notInstalled) {
            log_1.log('browser %s not installed', browser.name);
            return false;
        }
        throw err;
    };
    log_1.log('checking one browser %s', browser.name);
    return lookup(platform, browser)
        .then(ramda_1.merge(browser))
        .then(pickBrowserProps)
        .then(ramda_1.tap(logBrowser))
        .then(exports.setMajorVersion)
        .catch(failed);
}
/** returns list of detected browsers */
exports.detect = function (goalBrowsers) {
    // we can detect same browser under different aliases
    // tell them apart by the name and the version property
    if (!goalBrowsers) {
        goalBrowsers = browsers_1.browsers;
    }
    var removeDuplicates = ramda_1.uniqBy(function (browser) {
        return ramda_1.props(['name', 'version'], browser);
    });
    var compactFalse = function (browsers) {
        return lodash_1.compact(browsers);
    };
    log_1.log('detecting if the following browsers are present %o', goalBrowsers);
    return bluebird_1.default.mapSeries(goalBrowsers, checkBrowser)
        .then(ramda_1.flatten)
        .then(compactFalse)
        .then(removeDuplicates);
};
exports.detectByPath = function (path, goalBrowsers) {
    if (!goalBrowsers) {
        goalBrowsers = browsers_1.browsers;
    }
    var helper = getHelper();
    var detectBrowserByVersionString = function (stdout) {
        var browser = lodash_1.find(goalBrowsers, function (goalBrowser) {
            return goalBrowser.versionRegex.test(stdout);
        });
        if (!browser) {
            throw errors_1.notDetectedAtPathErr(stdout);
        }
        var regexExec = browser.versionRegex.exec(stdout);
        var parsedBrowser = {
            name: browser.name,
            displayName: "Custom " + browser.displayName,
            info: "Loaded from " + path,
            custom: true,
            path: path,
            version: regexExec[1],
        };
        exports.setMajorVersion(parsedBrowser);
        return lodash_1.extend({}, browser, parsedBrowser);
    };
    return helper
        .getVersionString(path)
        .then(detectBrowserByVersionString)
        .catch(function (err) {
        if (err.notDetectedAtPath) {
            throw err;
        }
        throw errors_1.notDetectedAtPathErr(err.message);
    });
};
