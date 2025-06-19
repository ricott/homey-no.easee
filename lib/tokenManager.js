'use strict';
const util = require('util');
const config = require('./const.js');
const Mutex = require('async-mutex').Mutex;
const mutex = new Mutex();

const MIN_TOKEN_AGE = 2 * 60 * 1000; // 2 minutes

class TokenManager {
    constructor() {
        this.userTokens = {};
    }

    // We should have cached token, and password should be the same
    #isTokenAlreadyCreated(username, password) {
        const tokenObj = this.#getTokenObjectFromCache(username);
        if (tokenObj && tokenObj.password == password) {
            return true;
        } else {
            return false;
        }
    }

    #getTokenObjectFromCache(username) {
        return this.userTokens[username];
    }

    #cacheToken(username, password, token, device) {
        this.userTokens[username] = new EaseeToken(username, password, token, device);
    }

    #getTokenFromCache(username) {
        return this.#getTokenObjectFromCache(username).token;
    }

    async getToken(username, password, device, force = false) {
        return await mutex.runExclusive(async () => {
            // If no cached token exists or password changed, generate new token
            if (!this.#isTokenAlreadyCreated(username, password)) {
                return await this.#generateAndCacheToken(username, password, device);
            }

            // If force refresh is requested, check if token is old enough
            if (force) {
                const tokenAge = Date.now() - this.#getTokenObjectFromCache(username).timestamp;
                if (tokenAge > MIN_TOKEN_AGE) {
                    return await this.#generateAndCacheToken(username, password, device);
                }
                logMessage(device, `Force refresh ignored - token is less than ${MIN_TOKEN_AGE}ms old`);
            }

            // Return cached token
            return this.#getTokenFromCache(username);
        });
    }

    async #generateAndCacheToken(username, password, device) {
        const token = await generateNewToken(username, password, device);
        this.#cacheToken(username, password, token, device);
        return this.#getTokenFromCache(username);
    }
}

//Singleton
module.exports = new TokenManager();

class EaseeToken {
    constructor(username, password, token, device) {
        this._username = username;
        this._password = password;
        this._token = token;
        this._device = device;
        this._timestamp = Date.now();
        this._retryCount = 0;
        this._maxRetries = 10;

        //If refresh fails, then login from start
        this._timer = this._device.homey.setInterval(async () => {
            try {
                const token = await refreshToken(this.username, this.token, this._device);
                this._token = token;
                this._timestamp = Date.now();
                this._retryCount = 0;
            } catch (error) {
                logMessage(this._device, `Failed to refresh tokens, generating new using user/password`);
                this._device.error(error);
                this._retryCount++;

                if (this._retryCount >= this._maxRetries) {
                    logMessage(this._device, `Max retries (${this._maxRetries}) reached, stopping refresh timer`);
                    this.cleanup();
                    return;
                }

                try {
                    const token = await generateNewToken(this.username, this.password, this._device);
                    this._token = token;
                    this._timestamp = Date.now();
                    this._retryCount = 0;
                } catch (error) {
                    logMessage(this._device, `Failed to generate new tokens, will retry ${this._maxRetries - this._retryCount} more times`);
                    this._device.error(error);
                }
            }
        }, ((this.token.expiresIn || 3600) - 120) * 1000);
    }

    cleanup() {
        if (this._timer) {
            this._device.homey.clearInterval(this._timer);
            this._timer = null;
        }
    }

    get username() {
        return this._username;
    }

    get password() {
        return this._password;
    }

    get token() {
        return Object.freeze(this._token);
    }

    get timestamp() {
        return this._timestamp;
    }
}

async function refreshToken(username, token, device) {
    logMessage(device, 'Refreshing access token');
    return await makeApiCall('refresh_token', token);
}

async function generateNewToken(username, password, device) {
    logMessage(device, 'Generating new access token');
    return await makeApiCall('login', {
        userName: username,
        password: password
    });
}

async function makeApiCall(endpoint, body) {
    const options = {
        method: 'POST',
        headers: {
            'Accept-Encoding': 'br, gzip, deflate',
            'Accept-Language': 'en-us',
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': '*/*'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.apiTimeout)
    };

    try {
        const response = await fetch(`https://${config.apiDomain}/api/accounts/${endpoint}`, options);

        if (response.ok) {
            const data = await response.json();
            return {
                refreshToken: data.refreshToken,
                accessToken: data.accessToken,
                expiresIn: data.expiresIn
            };
        }

        // Try to parse error response as JSON first
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            // If not JSON, get as text
            const text = await response.text();
            throw new Error(`${endpoint} failed! Call '/api/accounts/${endpoint}' failed, HTTP status code '${response.status}', and message '${text}'`);
        }

        // Handle specific error cases
        if (errorData.errorCode === 100 && errorData.errorCodeName === 'InvalidUserPassword') {
            throw new Error('InvalidUserPassword');
        }

        // For other error cases, throw with the error details
        throw new Error(`${endpoint} failed! Call '/api/accounts/${endpoint}' failed, HTTP status code '${response.status}', and message '${util.inspect(errorData, { showHidden: false, depth: null })}'`);
    } catch (error) {
        if (error.name === 'TimeoutError') {
            throw new Error(`${endpoint} request timed out after ${config.apiTimeout}ms`);
        }
        throw error;
    }
}

function logMessage(device, message) {
    if (device && typeof device.logMessage === 'function') {
        device.logMessage(message);
    } else {
        console.log(message);
    }
}