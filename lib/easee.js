'use strict';

const http = require('http.min');
const EventEmitter = require('events');
const util = require('util');
const config = require('./const.js');
const apiErrorEventName = 'easee_api_error';

function EaseeCharger(options) {
    var self = this;
    EventEmitter.call(self);
    if (options == null) { options = {} };
    self.options = options;
}
util.inherits(EaseeCharger, EventEmitter);

EaseeCharger.prototype.getTokens = function () {
    var self = this;
    return self.options;
}

EaseeCharger.prototype.updateTokens = function (tokens) {
    var self = this;
    self.options = tokens;
}

EaseeCharger.prototype.startCharging = function (chargerId) {
    var self = this;
    return postCommand(self.options, `/api/chargers/${chargerId}/commands/start_charging`)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

EaseeCharger.prototype.stopCharging = function (chargerId) {
    var self = this;
    return postCommand(self.options, `/api/chargers/${chargerId}/commands/stop_charging`)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

EaseeCharger.prototype.pauseCharging = function (chargerId) {
    var self = this;
    return postCommand(self.options, `/api/chargers/${chargerId}/commands/pause_charging`)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

EaseeCharger.prototype.resumeCharging = function (chargerId) {
    var self = this;
    return postCommand(self.options, `/api/chargers/${chargerId}/commands/resume_charging`)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

EaseeCharger.prototype.toggleCharging = function (chargerId) {
    var self = this;
    return postCommand(self.options, `/api/chargers/${chargerId}/commands/toggle_charging`)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

EaseeCharger.prototype.setChargerState = function (chargerId, state) {
    var self = this;
    let data = {
        enabled: state
    };
    return postCommand(self.options, `/api/chargers/${chargerId}/settings`, data)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

//TODO: allow single phase charger to select which phase to use, 
//set amp to 0 on phases you don't want to use

EaseeCharger.prototype.setDynamicCurrent = function (siteId, circuitId, amp) {
    var self = this;
    let data = {
        dynamicCircuitCurrentP1: amp,
        dynamicCircuitCurrentP2: amp,
        dynamicCircuitCurrentP3: amp
    };
    return postCommand(self.options, `/api/sites/${siteId}/circuits/${circuitId}/settings`, data)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

EaseeCharger.prototype.getChargerConfig = function (chargerId) {
    var self = this;
    return getCommand(self.options, `/api/chargers/${chargerId}/config`)
        .then(function (config) {
            return config;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

EaseeCharger.prototype.getChargerDetails = function (chargerId) {
    var self = this;
    return getCommand(self.options, `/api/chargers/${chargerId}/details`)
        .then(function (details) {
            return details;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

EaseeCharger.prototype.getChargerState = function (chargerId) {
    var self = this;
    return getCommand(self.options, `/api/chargers/${chargerId}/state`)
        .then(function (state) {
            return state;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

EaseeCharger.prototype.getSiteInfo = function (chargerId) {
    var self = this;
    return getCommand(self.options, `/api/chargers/${chargerId}/site`)
        .then(function (site) {
            return site;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

EaseeCharger.prototype.getChargers = function () {
    var self = this;
    return getCommand(self.options, '/api/chargers')
        .then(function (chargers) {
            return chargers;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

EaseeCharger.prototype.getLast30DaysChargekWh = function (chargerId) {
    var self = this;
    let fromDate = new Date();
    fromDate.setDate(fromDate.getDate()-30)
    let fromDateString = fromDate.toISOString();
    let toDateString = new Date().toISOString();

    return getCommand(self.options, `/api/sessions/charger/${chargerId}/total/${fromDateString}/${toDateString}`)
        .then(function (stats) {
            return stats;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

EaseeCharger.prototype.getCurrentMonthChargekWh = function (chargerId) {
    var self = this;
    let today = new Date();
    let fromDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    let toDate = today.toISOString();

    return getCommand(self.options, `/api/sessions/charger/${chargerId}/total/${fromDate}/${toDate}`)
        .then(function (stats) {
            return stats;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

EaseeCharger.prototype.getLastChargeSessionkWh = function (chargerId) {
    var self = this;
    //Look for sessions in last week
    let fromDate = new Date();
    fromDate.setDate(fromDate.getDate()-7)
    let fromDateString = fromDate.toISOString();
    let toDateString = new Date().toISOString();

    return getCommand(self.options, `/api/sessions/charger/${chargerId}/sessions/${fromDateString}/${toDateString}`)
        .then(function (sessions) {
            let sessionCharge = 0;
            if (sessions[0] || sessions[0].kiloWattHours) {
                sessionCharge = sessions[0].kiloWattHours;
            }
            return sessionCharge;
        })
        .catch(reason => {
            self.emit(apiErrorEventName, reason);
            return Promise.reject(reason);
        });
}

function postCommand(inputOptions, path, data) {
    let options = {
        timeout: config.apiTimeout,
        protocol: config.apiProtocol,
        hostname: config.apiDomain,
        path: path,
        headers: {
            'Accept-Encoding': 'br, gzip, deflate',
            'Accept-Language': 'en-us',
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': '*/*',
            'Authorization': `Bearer ${inputOptions.accessToken}`
        }
    };

    if (data) {
        options.json = data;
    }

    return http.post(options)
        .then(function (result) {
            //202 means command is queued for execution on charger, should be treated as success
            if (result.response.statusCode == 200 || result.response.statusCode == 202) {
                try {
                    return JSON.parse(result.data);
                } catch (error) {
                    return result.data;
                }
            } else if (result.response.statusCode == 401) {
                return Promise.reject(new Error(`Access token expired, HTTP status code '${result.response.statusCode}'`));
            } else {
                return Promise.reject(new Error(`Command '${path}' failed, HTTP status code '${result.response.statusCode}', and message '${result.data}'`));
            }
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function getCommand(inputOptions, path) {
    let options = {
        timeout: config.apiTimeout,
        protocol: config.apiProtocol,
        hostname: config.apiDomain,
        path: path,
        headers: {
            'Accept-Encoding': 'br, gzip, deflate',
            'Accept-Language': 'en-us',
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': '*/*',
            'Authorization': `Bearer ${inputOptions.accessToken}`
        }
    };

    return http.get(options)
        .then(function (result) {
            //console.log(result);
            if (result.response.statusCode == 200) {
                try {
                    return JSON.parse(result.data);
                } catch (error) {
                    return result.data;
                }
            } else if (result.response.statusCode == 401) {
                return Promise.reject(new Error(`Access token expired, HTTP status code '${result.response.statusCode}'`));
            } else {
                return Promise.reject(new Error(`Command '${path}' failed, HTTP status code '${result.response.statusCode}', and message '${result.data}'`));
            }
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

exports = module.exports = EaseeCharger;