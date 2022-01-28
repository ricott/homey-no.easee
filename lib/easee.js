'use strict';

const http = require('http.min');
const util = require('util');
const config = require('./const.js');

function Easee(options) {
    if (options == null) { options = {} };
    this.options = options;
}

Easee.prototype.rebootCharger = function (chargerId) {
    return postCommand(this.options, `/api/chargers/${chargerId}/commands/reboot`)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.startCharging = function (chargerId) {
    return postCommand(this.options, `/api/chargers/${chargerId}/commands/start_charging`)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.stopCharging = function (chargerId) {
    return postCommand(this.options, `/api/chargers/${chargerId}/commands/stop_charging`)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.pauseCharging = function (chargerId) {
    return postCommand(this.options, `/api/chargers/${chargerId}/commands/pause_charging`)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.resumeCharging = function (chargerId) {
    return postCommand(this.options, `/api/chargers/${chargerId}/commands/resume_charging`)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.toggleCharging = function (chargerId) {
    return postCommand(this.options, `/api/chargers/${chargerId}/commands/toggle_charging`)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.overrideSchedule = function (chargerId) {
    return postCommand(this.options, `/api/chargers/${chargerId}/commands/override_schedule`)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.enableSmartCharging = function (chargerId) {
    let data = {
        smartCharging: true,
        smartButtonEnabled: true
    };
    return postCommand(this.options, `/api/chargers/${chargerId}/settings`, data)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.disableSmartCharging = function (chargerId) {
    let data = {
        smartCharging: false,
        smartButtonEnabled: false
    };
    return postCommand(this.options, `/api/chargers/${chargerId}/settings`, data)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.pauseSmartCharging = function (chargerId) {
    let data = {
        smartCharging: false
    };
    return postCommand(this.options, `/api/chargers/${chargerId}/settings`, data)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.setChargerState = function (chargerId, state) {
    let data = {
        enabled: state
    };
    return postCommand(this.options, `/api/chargers/${chargerId}/settings`, data)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.enableIdleCurrent = function (chargerId, state) {
    let data = {
        enableIdleCurrent: state
    };
    return postCommand(this.options, `/api/chargers/${chargerId}/settings`, data)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.lockCablePermanently = function (chargerId, state) {
    let data = {
        lockCablePermanently: state
    };
    return postCommand(this.options, `/api/chargers/${chargerId}/settings`, data)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

//Accept values 1-100
Easee.prototype.ledStripBrightness = function (chargerId, brightness) {
    let data = {
        ledStripBrightness: brightness
    };
    return postCommand(this.options, `/api/chargers/${chargerId}/settings`, data)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

//These are the values you need to change when doing load balancing
//Is only set on the master (circuit) on site level. The master will handle circuit load balancing based on this value.
//This value will be reset if a charger is restarted, and go back to 40A
Easee.prototype.setDynamicCurrentPerPhase = function (siteId, circuitId,
    currentP1, currentP2, currentP3) {

    if (!isInt(currentP1) || !isInt(currentP2) || !isInt(currentP3)) {
        return Promise.reject(new Error(`Invalid current values '${currentP1}/${currentP2}/${currentP3}'`));
    }

    let data = {
        dynamicCircuitCurrentP1: currentP1,
        dynamicCircuitCurrentP2: currentP2,
        dynamicCircuitCurrentP3: currentP3
    };
    return postCommand(this.options, `/api/sites/${siteId}/circuits/${circuitId}/settings`, data)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.setBasicChargePlan = function (chargerId, startTime, endTime, repeat) {
    let today = new Date();
    let startDateTime = new Date(today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        startTime.substring(0, 2),
        startTime.substring(3),
        0, 0);
    let endDateTime = new Date(today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        endTime.substring(0, 2),
        endTime.substring(3),
        0, 0);

    //Usually start times are in the middle of the night, ie for today this time has 
    //already passed, lets move one day forward
    if (startDateTime.getTime() < today.getTime()) {
        startDateTime.setDate(startDateTime.getDate() + 1);
        endDateTime.setDate(endDateTime.getDate() + 1);
    }

    //If end is before start, add a day
    //example start=23:00, end equals 03:00
    if (endDateTime.getTime() < startDateTime.getTime()) {
        endDateTime.setDate(endDateTime.getDate() + 1);
    }

    let data = {
        chargeStartTime: startDateTime.toISOString(),
        chargeStopTime: endDateTime.toISOString(),
        repeat: repeat
    };
    return postCommand(this.options, `/api/chargers/${chargerId}/basic_charge_plan`, data)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.deleteBasicChargePlan = function (chargerId) {
    return deleteCommand(this.options, `/api/chargers/${chargerId}/basic_charge_plan`)
        .then(function (result) {
            return result;
        })
        .catch(reason => {
            //If you try to delete the charge plan and it is not there you get a 404 error
            if (reason.message.indexOf('404') > -1) {
                return {};
            } else {
                return Promise.reject(reason);
            }
        });
}

Easee.prototype.getDynamicCurrent = function (siteId, circuitId) {
    return getCommand(this.options, `/api/sites/${siteId}/circuits/${circuitId}/dynamicCurrent`)
        .then(function (dynamicCurrent) {
            return dynamicCurrent;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.getBasicChargePlan = function (chargerId) {
    return getCommand(this.options, `/api/chargers/${chargerId}/basic_charge_plan`)
        .then(function (schedule) {
            return schedule;
        })
        .catch(reason => {
            //If you try to get the charge plan and it is not there you get a 404 error
            if (reason.message.indexOf('404') > -1) {
                return {};
            } else {
                return Promise.reject(reason);
            }

        });
}

Easee.prototype.getChargerConfig = function (chargerId) {
    return getCommand(this.options, `/api/chargers/${chargerId}/config`)
        .then(function (config) {
            return config;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.getChargerDetails = function (chargerId) {
    return getCommand(this.options, `/api/chargers/${chargerId}/details`)
        .then(function (details) {
            return details;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.getChargerState = function (chargerId) {
    return getCommand(this.options, `/api/chargers/${chargerId}/state`)
        .then(function (state) {
            return state;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.getSiteInfo = function (chargerId) {
    return getCommand(this.options, `/api/chargers/${chargerId}/site`)
        .then(function (site) {
            return site;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.getChargers = function () {
    return getCommand(this.options, '/api/accounts/products')
        .then(function (results) {
            let chargersArr = [];
            results.forEach(result => {
                result.circuits.forEach(circuit => {
                    if (circuit.chargers) {
                        circuit.chargers.forEach(charger => {
                            chargersArr.push(charger);
                        });
                    }
                });
            });
            return chargersArr;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.getEqualizers = function () {
    return getCommand(this.options, '/api/accounts/products')
        .then(function (results) {
            let equalizersArr = [];
            results.forEach(result => {
                result.equalizers.forEach(equalizer => {
                    equalizersArr.push(equalizer);
                });
            });
            return equalizersArr;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.getEqualizerSiteInfo = function (equalizerId) {
    return getCommand(this.options, `/api/equalizers/${equalizerId}/site`)
        .then(function (site) {
            return site;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.getLast30DaysChargekWh = function (chargerId) {
    let fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30)
    let fromDateString = fromDate.toISOString();
    let toDateString = new Date().toISOString();

    return getCommand(this.options, `/api/sessions/charger/${chargerId}/total/${fromDateString}/${toDateString}`)
        .then(function (stats) {
            return stats;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.getLastMonthChargekWh = function (chargerId) {
    let today = new Date();
    let fromDateString = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
    let toDateString = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59).toISOString();

    return getCommand(this.options, `/api/sessions/charger/${chargerId}/total/${fromDateString}/${toDateString}`)
        .then(function (stats) {
            return stats;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

Easee.prototype.getLastChargeSessionkWh = function (chargerId) {
    //Look for sessions in last week
    let fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7)
    let fromDateString = fromDate.toISOString();
    let toDateString = new Date().toISOString();

    return getCommand(this.options, `/api/sessions/charger/${chargerId}/sessions/${fromDateString}/${toDateString}`)
        .then(function (sessions) {
            let sessionCharge = 0;
            if (sessions[0] && sessions[0].kiloWattHours) {
                sessionCharge = sessions[0].kiloWattHours;
            }
            return sessionCharge;
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function deleteCommand(inputOptions, path) {
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
            'Authorization': `Bearer ${inputOptions.accessToken}`,
            'User-Agent': `${config.userAgent}/${inputOptions.appVersion}`
        }
    };

    return http.delete(options)
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
                let message;
                try {
                    message = util.inspect(result.data, { showHidden: false, depth: null });
                } catch (e) {
                    message = result.data;
                }
                return Promise.reject(new Error(`DELETE '${path}' failed, HTTP status code '${result.response.statusCode}', and message '${message}'`));
            }
        })
        .catch(reason => {
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
            'Authorization': `Bearer ${inputOptions.accessToken}`,
            'User-Agent': `${config.userAgent}/${inputOptions.appVersion}`
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
                let message;
                try {
                    message = util.inspect(result.data, { showHidden: false, depth: null });
                } catch (e) {
                    message = result.data;
                }
                return Promise.reject(new Error(`POST '${path}' failed, HTTP status code '${result.response.statusCode}', and message '${message}'`));
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
            'Authorization': `Bearer ${inputOptions.accessToken}`,
            'User-Agent': `${config.userAgent}/${inputOptions.appVersion}`
        }
    };

    return http.get(options)
        .then(function (result) {
            if (result.response.statusCode == 200) {
                try {
                    return JSON.parse(result.data);
                } catch (error) {
                    return result.data;
                }
            } else if (result.response.statusCode == 401) {
                return Promise.reject(new Error(`Access token expired, HTTP status code '${result.response.statusCode}'`));
            } else {
                let message;
                try {
                    message = util.inspect(result.data, { showHidden: false, depth: null });
                } catch (e) {
                    message = result.data;
                }
                return Promise.reject(new Error(`GET '${path}' failed, HTTP status code '${result.response.statusCode}', and message '${message}'`));
            }
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function isInt(value) {
    return !isNaN(value) && (function (x) { return (x | 0) === x; })(parseFloat(value))
}

exports = module.exports = Easee;