'use strict';

const http = require('http.min');
const util = require('util');
const config = require('./const.js');

exports.login = function (options) {
    return login(options).then(function (result) {
        return result;
    }).catch(reason => {
        return Promise.reject(reason);
    });
}

exports.refreshToken = function (tokens) {
    return refreshToken(tokens).then(function (result) {
        return result;
    }).catch(reason => {
        return Promise.reject(reason);
    });
}

function refreshToken(tokens) {
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

    options.json = tokens;

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
                    message = util.inspect(result.data, {showHidden: false, depth: null});
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

function login(inputOptions) {
    let options = {
        timeout: config.apiTimeout,
        protocol: config.apiProtocol,
        hostname: config.apiDomain,
        path: '/api/accounts/token',
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
                    accessToken: result.data.accessToken
                };
            } else {
                let message;
                try {
                    message = util.inspect(result.data, {showHidden: false, depth: null});
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