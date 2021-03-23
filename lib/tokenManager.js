'use strict';

const LoginHelper = require('./loginHelper.js');
const Mutex = require('async-mutex').Mutex;
const mutex = new Mutex();

class TokenManager {
    constructor() {
        this.connections = {};
        this.release = null;
    }

    getTokens(username, password) {
        var self = this;
        return mutex.acquire()
            .then(function (release) {
                self.release = release;
                if (self.connections[username] == null) {
                    return createConn(username, password)
                        .then(function (tokens) {
                            self.connections[username] = new EaseeToken(username, password, tokens);
                            return self.connections[username].tokens;
                        }).catch(reason => {
                            return Promise.reject(reason);
                        });
                } else {
                    return Promise.resolve(Object.freeze(self.connections[username].tokens));
                }
            })
            .catch(reason => {
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
        //Tokens are valid for 24h, refresh after 23h
        //If refresh fails, then login from start
        this._timer = setInterval(() => {
            let self = this;
            console.log(`Refreshing access tokens for username '${self.username}'`);
            refreshToken(self.tokens)
                .then(function (tokens) {
                    self._tokens = tokens;
                }).catch(reason => {
                    console.log('Failed to refresh tokens, generating new using user/password');
                    createConn(self.username, self.password)
                        .then(function (tokens) {
                            self._tokens = tokens;
                        }).catch(reason => {
                            console.log('Failed to generate new tokens, out of luck :(');
                        });
                });
        }, 60 * 60 * 23 * 1000);
    }

    get username() {
        return this._username;
    }

    get password() {
        return this._password;
    }

    get tokens() {
        return this._tokens;
    }
}

function refreshToken(tokens) {
    return LoginHelper.refreshToken(tokens)
        .then(function (tokens) {
            return tokens;
        }).catch(reason => {
            console.log(reason);
            return Promise.reject(reason);
        });
}

function createConn(username, password) {
    console.log(`Generating new access tokens for username '${username}'`);
    return LoginHelper.login({
        userName: username,
        password: password
    }).then(function (tokens) {
        return tokens;
    }).catch(reason => {
        console.log(reason);
        return Promise.reject(reason);
    });
}