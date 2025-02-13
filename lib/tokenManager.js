'use strict';
const util = require('util');
const config = require('./const.js');
const Mutex = require('async-mutex').Mutex;
const mutex = new Mutex();

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

    #cacheToken(username, password, token) {
        this.userTokens[username] = new EaseeToken(username, password, token);
    }

    #getTokenFromCache(username) {
        return this.#getTokenObjectFromCache(username).token;
    }

    getToken(username, password, force) {
        return mutex.runExclusive(async () => {
            try {
                if (!this.#isTokenAlreadyCreated(username, password)) {
                    const token = await generateNewToken(username, password);
                    this.#cacheToken(username, password, token);
                    return this.#getTokenFromCache(username);
                } else if (force) {
                    const now = new Date().getTime();
                    const tokenAge = now - this.#getTokenObjectFromCache(username).timestamp;
                    //Even with force, if token is less than 2 mins old then ignore that request
                    if (tokenAge > (2 * 60 * 1000)) {
                        const token = await generateNewToken(username, password);
                        this.#cacheToken(username, password, token);
                        return this.#getTokenFromCache(username);
                    } else {
                        console.log(`[${username}] Create new token using force ignored, less than 2 mins old token`);
                        return this.#getTokenFromCache(username);
                    }
                } else {
                    return this.#getTokenFromCache(username);
                }
            } catch (error) {
                throw error;
            }
        });
    }
}

//Singleton
module.exports = new TokenManager();

class EaseeToken {
    constructor(username, password, token) {
        this._username = username;
        this._password = password;
        this._token = token;
        this._timestamp = new Date().getTime();
        this._retryCount = 0;
        this._maxRetries = 10;

        //If refresh fails, then login from start
        this._timer = setInterval(async () => {
            try {
                const token = await refreshToken(this.username, this.token);
                this._token = token;
                this._timestamp = new Date().getTime();
                this._retryCount = 0;
            } catch (error) {
                console.log(`[${this.username}] Failed to refresh tokens, generating new using user/password`);
                console.error(error);
                this._retryCount++;

                if (this._retryCount >= this._maxRetries) {
                    console.log(`[${this.username}] Max retries (${this._maxRetries}) reached, stopping refresh timer`);
                    this.cleanup();
                    return;
                }

                try {
                    const token = await generateNewToken(this.username, this.password);
                    this._token = token;
                    this._timestamp = new Date().getTime();
                    this._retryCount = 0;
                } catch (error) {
                    console.log(`[${this.username}] Failed to generate new tokens, will retry ${this._maxRetries - this._retryCount} more times`);
                    console.error(error);
                }
            }
        }, ((this.token.expiresIn || 3600) - 120) * 1000);
    }

    cleanup() {
        if (this._timer) {
            clearInterval(this._timer);
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

async function refreshToken(username, token) {
    console.log(`[${username}] Refreshing access token`);
    return await makeApiCall('refresh_token', token);
}

async function generateNewToken(username, password) {
    console.log(`[${username}] Generating new access token`);
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

        let message;
        try {
            const data = await response.text();
            message = util.inspect(JSON.parse(data), { showHidden: false, depth: null });
        } catch (e) {
            message = await response.text();
        }
        throw new Error(`${endpoint} failed! Call '/api/accounts/${endpoint}' failed, HTTP status code '${response.status}', and message '${message}'`);
    } catch (error) {
        if (error.name === 'TimeoutError') {
            throw new Error(`${endpoint} request timed out after ${config.apiTimeout}ms`);
        }
        throw error;
    }
}