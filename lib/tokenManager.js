'use strict';

const LoginHelper = require('./loginHelper.js');
const Mutex = require('async-mutex').Mutex;
const mutex = new Mutex();

class TokenManager {
    constructor() {
        this.connections = {};
        this.release = null;
    }

    getTokens(username, password, force) {
        var self = this;
        return mutex.acquire()
            .then(function (release) {
                self.release = release;
                if (self.connections[username] == null) {
                    return createConn(username, password)
                        .then(function (tokens) {
                            self.connections[username] = new EaseeToken(username, password, tokens);
                            return Promise.resolve(self.connections[username].tokens);
                        }).catch(function (reason) {
                            return Promise.reject(reason);
                        });
                } else if (force) {
                    const now = new Date().getTime();
                    let tokenAge = now - self.connections[username].timestamp;
                    //console.log(`[${username}] Token is from '${self.connections[username].timestamp}', time now '${now}'`);
                    //Even with force, if token is less than 2 mins old then ignore that request
                    if (tokenAge > (2 * 60 * 1000)) {
                        return createConn(username, password)
                            .then(function (tokens) {
                                self.connections[username] = new EaseeToken(username, password, tokens);
                                return Promise.resolve(self.connections[username].tokens);
                            }).catch(function (reason) {
                                return Promise.reject(reason);
                            });
                    } else {
                        console.log(`[${username}] Create new token using force ignored, less than 2 mins old token`);
                        return Promise.resolve(self.connections[username].tokens);
                    }
                } else {
                    return Promise.resolve(self.connections[username].tokens);
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
    constructor(username, password, tokens) {
        this._username = username;
        this._password = password;
        this._tokens = tokens;
        this._timestamp = new Date().getTime();
        //Tokens are valid for 1h, refresh after 55 minutes
        //If refresh fails, then login from start
        this._timer = setInterval(() => {
            let self = this;
            console.log(`[${self.username}] Refreshing access tokens for username`);
            refreshToken(self.tokens)
                .then(function (tokens) {
                    self._tokens = tokens;
                    self._timestamp = new Date().getTime();
                }).catch(function (reason) {
                    console.log(`[${self.username}] Failed to refresh tokens, generating new using user/password`);
                    console.error(reason);
                    createConn(self.username, self.password)
                        .then(function (tokens) {
                            self._tokens = tokens;
                            self._timestamp = new Date().getTime();
                        }).catch(function (reason) {
                            console.log(`[${self.username}] Failed to generate new tokens, out of luck :(`);
                            console.error(reason);
                        });
                });
        }, 60 * 55 * 1000);
    }

    get username() {
        return this._username;
    }

    get password() {
        return this._password;
    }

    get tokens() {
        return Object.freeze(this._tokens);
    }

    get timestamp() {
        return this._timestamp;
    }
}

function refreshToken(tokens) {
    return LoginHelper.refreshToken(tokens)
        .then(function (tokens) {
            return tokens;
        }).catch(function (reason) {
            console.log(reason);
            return Promise.reject(reason);
        });
}

function createConn(username, password) {
    console.log(`[${username}] Generating new access token`);
    return LoginHelper.login({
        userName: username,
        password: password
    }).then(function (tokens) {
        return tokens;
    }).catch(function (reason) {
        console.log(reason);
        return Promise.reject(reason);
    });
}