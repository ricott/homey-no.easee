'use strict';
const http = require('http.min');
const util = require('util');
const config = require('./const.js');
const Mutex = require('async-mutex').Mutex;
const mutex = new Mutex();

class TokenManager {
    constructor() {
        this.userTokens = {};
        this.release = null;
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
        var self = this;
        return mutex.acquire()
            .then(function (release) {
                self.release = release;
                if (!self.#isTokenAlreadyCreated(username, password)) {
                    return generateNewToken(username, password)
                        .then(function (token) {
                            self.#cacheToken(username, password, token);
                            return Promise.resolve(self.#getTokenFromCache(username));
                        }).catch(function (reason) {
                            return Promise.reject(reason);
                        });
                } else if (force) {
                    const now = new Date().getTime();
                    const tokenAge = now - self.#getTokenObjectFromCache(username).timestamp;
                    //console.log(`[${username}] Token is from '${#getTokenObjectFromCache(username).timestamp}', time now '${now}'`);
                    //Even with force, if token is less than 2 mins old then ignore that request
                    if (tokenAge > (2 * 60 * 1000)) {
                        return generateNewToken(username, password)
                            .then(function (token) {
                                self.#cacheToken(username, password, token);
                                return Promise.resolve(self.#getTokenFromCache(username));
                            }).catch(function (reason) {
                                return Promise.reject(reason);
                            });
                    } else {
                        console.log(`[${username}] Create new token using force ignored, less than 2 mins old token`);
                        return Promise.resolve(self.#getTokenFromCache(username));
                    }
                } else {
                    return Promise.resolve(self.#getTokenFromCache(username));
                }
            })
            .catch(function (reason) {
                //console.log('Error getting token', reason);
                return Promise.reject(reason);
            })
            .finally(function () {
                self.release();
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

        //If refresh fails, then login from start
        this._timer = setInterval(() => {
            let self = this;
            refreshToken(self.username, self.token)
                .then(function (token) {
                    self._token = token;
                    self._timestamp = new Date().getTime();
                }).catch(function (reason) {
                    console.log(`[${self.username}] Failed to refresh tokens, generating new using user/password`);
                    console.error(reason);
                    generateNewToken(self.username, self.password)
                        .then(function (token) {
                            self._token = token;
                            self._timestamp = new Date().getTime();
                        }).catch(function (reason) {
                            console.log(`[${self.username}] Failed to generate new tokens, out of luck :(`);
                            console.error(reason);
                        });
                });
        }, ((this.token.expiresIn || 3600) - 120) * 1000);
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

function refreshToken(username, token) {
    console.log(`[${username}] Refreshing access token`);
    return _refreshToken(token)
        .then(function (token) {
            return token;
        }).catch(function (reason) {
            return Promise.reject(reason);
        });
}

function generateNewToken(username, password) {
    console.log(`[${username}] Generating new access token`);
    return _login({
        userName: username,
        password: password
    }).then(function (token) {
        return token;
    }).catch(function (reason) {
        return Promise.reject(reason);
    });
}

function _refreshToken(token) {
    let options = {
        timeout: config.apiTimeout,
        protocol: config.apiProtocol,
        hostname: config.apiDomain,
        path: '/api/accounts/refresh_token',
        json: true,
        headers: {
            'Accept-Encoding': 'br, gzip, deflate',
            'Accept-Language': 'en-us',
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': '*/*'
        }
    };

    options.json = token;

    return http.post(options)
        .then(function (result) {
            if (result.response.statusCode === 200) {
                return {
                    refreshToken: result.data.refreshToken,
                    accessToken: result.data.accessToken,
                    expiresIn: result.data.expiresIn
                };
            } else {
                let message;
                try {
                    message = util.inspect(result.data, { showHidden: false, depth: null });
                } catch (e) {
                    message = result.data;
                }
                let msg = `Refresh token failed! Call '${options.path}' failed, HTTP status code '${result.response.statusCode}', and message '${message}'`;
                //console.log(msg);
                return Promise.reject(new Error(msg));
            }
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function _login(inputOptions) {
    let options = {
        timeout: config.apiTimeout,
        protocol: config.apiProtocol,
        hostname: config.apiDomain,
        path: '/api/accounts/login',
        json: true,
        headers: {
            'Accept-Encoding': 'br, gzip, deflate',
            'Accept-Language': 'en-us',
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': '*/*'
        }
    };

    options.json = inputOptions;

    return http.post(options)
        .then(function (result) {
            if (result.response.statusCode === 200) {
                return {
                    refreshToken: result.data.refreshToken,
                    accessToken: result.data.accessToken,
                    expiresIn: result.data.expiresIn
                };
            } else {
                let message;
                try {
                    message = util.inspect(result.data, { showHidden: false, depth: null });
                } catch (e) {
                    message = result.data;
                }
                let msg = `Login failed! Call '${options.path}' failed, HTTP status code '${result.response.statusCode}', and message '${message}'`;
                //console.log(msg);
                return Promise.reject(new Error(msg));
            }
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}
