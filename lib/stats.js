'use strict';

class Stats {
    constructor(options) {
        this.startOfStats = new Date();
        this.reset();
    }

    countInvocation = function (api) {
        this.totalInvocations++;
        let counter = this.invocationCounter[api] || 0;
        counter++;
        this.invocationCounter[api] = counter;

        let apiInvocations = this.invocationsList[api] || {};
        apiInvocations[new Date().toISOString()] = api;
        this.invocationsList[api] = apiInvocations;
    }

    countError = function (api, error) {
        let counter = this.errorCounter[api] || 0;
        counter++;
        this.errorCounter[api] = counter;

        let errors = this.errorsList[error] || {};
        errors[new Date().toISOString()] = api;
        this.errorsList[error] = errors;
    }

    getInitDatetime = function(timezone) {
        const date = `${this.startOfStats.getFullYear()}-${pad(this.startOfStats.getMonth() + 1, 2)}-${pad(this.startOfStats.getDate(), 2)}`;
        //https://github.com/athombv/homey-apps-sdk-issues/issues/169
        const time = this.startOfStats.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone });
        return `${date} ${time}`
    }

    getTotalInvocations = function () {
        return this.totalInvocations;
    }

    getInvocationStats = function () {
        return this.invocationCounter;
    }

    getInvocationList = function () {
        return this.invocationsList;
    }

    getErrorStats = function () {
        return this.errorCounter;
    }

    getErrorList = function () {
        return this.errorsList;
    }

    reset = function () {
        this.totalInvocations = 0;
        this.invocationCounter = {};
        this.invocationsList = {};
        this.errorCounter = {};
        this.errorsList = {};
    }
}

module.exports = Stats;

function pad(num, size) {
    var s = "000000000" + num;
    return s.substring(s.length - size);
}