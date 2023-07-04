'use strict';
const Https = require('http.min');
const config = require('./const.js');
const enums = require('./enums.js');
const spacetime = require('spacetime');

const SETTINGS_OBSERVATION_IDS = enums.getSettingsObservationIds();
const STATE_OBSERVATION_IDS = enums.getStateObservationIds();

class Easee {
    constructor(options, stats) {
        if (options == null) {
            options = {}
        };
        this.options = options;
        this.stats = stats;
    }

    #postWaitForResponse = function (url, payload) {
        let self = this;
        self._logMessage('INFO', `Invoking url '${url}'`);
        return invoke(config.apiDomain, 'post', self, url, payload)
            .then(function (result) {
                return awaitSuccessfulCommandInvocation(self, result)
                    .then(function (result) {
                        return result;
                    })
                    .catch(reason => {
                        return Promise.reject(reason);
                    });
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    rebootCharger = function (chargerId) {
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/commands/reboot`)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    /*
        Allows a charger with 'authorizationRequired' = true to deliver power. 
        Otherwise it will have no effect
    */
    startCharging = function (chargerId) {
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/commands/start_charging`)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    /*
        Stops a charger with an active authorization from delivering power and 
        revokes authorization. Will have no effect if 'authorizationRequired' is 
        false or charger is not authorized
    */
    stopCharging = function (chargerId) {
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/commands/stop_charging`)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    /*
        Pauses current charging session but keeps authorization. 
        Limits dynamic charger current to 0.
        Reset on on new car connection
    */
    pauseCharging = function (chargerId) {
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/commands/pause_charging`)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    /*
        Resumes current charging session. Resets output current limit 
        set in dynamic charger current
    */
    resumeCharging = function (chargerId) {
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/commands/resume_charging`)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    /*
        Send charging command (Start/Stop or Pause/Resume). 
        For chargers requiring online authorization, start/stop commands are used.
        For chargers without online authorization, pause/resume commands are used.
    */
    toggleCharging = function (chargerId) {
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/commands/toggle_charging`)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    pollLifetimeEnergy = function (chargerId) {
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/commands/poll_lifetimeenergy`)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    overrideSchedule = function (chargerId) {
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/commands/override_schedule`)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    setAuthorizationRequired = function (chargerId, authRequired) {
        const data = {
            authorizationRequired: authRequired
        };

        return this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    enableSmartCharging = function (chargerId) {
        const data = {
            smartCharging: true,
            smartButtonEnabled: true
        };
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    disableSmartCharging = function (chargerId) {
        const data = {
            smartCharging: false,
            smartButtonEnabled: false
        };
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    pauseSmartCharging = function (chargerId) {
        const data = {
            smartCharging: false
        };
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    setChargerState = function (chargerId, state) {
        const data = {
            enabled: state
        };
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    enableIdleCurrent = function (chargerId, state) {
        const data = {
            enableIdleCurrent: state
        };
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    lockCablePermanently = function (chargerId, state) {
        const data = {
            lockCablePermanently: state
        };
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    //Accept values 1-100
    ledStripBrightness = function (chargerId, brightness) {
        const data = {
            ledStripBrightness: brightness
        };
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    setDynamicChargerCurrent = function (chargerId, current) {
        const data = {
            dynamicChargerCurrent: current
        };
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    setMaxChargerCurrent = function (chargerId, current) {
        const data = {
            maxChargerCurrent: current
        };
        return this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    setChargingPrice = function (siteId, currency, costPerKWh, taxPerKWh) {
        if (!isInt(siteId)) {
            return Promise.reject(new Error(`Site Id is empty! Please try and restart the Easee app. Verify the Site Id in the settings view of the charger device.`));
        }

        let data = {
            currencyId: currency,
            costPerKWh: costPerKWh
        };

        if (taxPerKWh != 0) {
            data.vat = taxPerKWh;
            data.costPerKwhExcludeVat = costPerKWh - taxPerKWh;
        }

        return invoke(config.apiDomain, 'post', this, `/api/sites/${siteId}/price`, data)
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
    setDynamicCurrentPerPhase = function (siteId, circuitId,
        currentP1, currentP2, currentP3) {

        if (!isInt(siteId) || !isInt(circuitId)) {
            return Promise.reject(new Error(`Site Id and/or Circuit Id is empty! Please try and restart the Easee app. Verify the Id's in the settings view of the charger device.`));
        }

        if (!isInt(currentP1) || !isInt(currentP2) || !isInt(currentP3)) {
            return Promise.reject(new Error(`Invalid current values '${currentP1}/${currentP2}/${currentP3}'`));
        }

        let data = {
            dynamicCircuitCurrentP1: currentP1,
            dynamicCircuitCurrentP2: currentP2,
            dynamicCircuitCurrentP3: currentP3
        };
        return this.#postWaitForResponse(`/api/sites/${siteId}/circuits/${circuitId}/settings`, data)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    setBasicChargePlan = function (chargerId, startTime, endTime, repeat, timezone) {

        let startDateTime = spacetime.now(timezone);
        startDateTime = startDateTime.time(startTime);

        let endDateTime = spacetime.now(timezone);
        endDateTime = endDateTime.time(endTime);

        //Usually start times are in the middle of the night, ie for today this time has 
        //already passed, lets move one day forward
        if (startDateTime.isBefore(Date.now())) {
            startDateTime = startDateTime.add(1, 'day');
            endDateTime = endDateTime.add(1, 'day');
        }

        //If end is before start, add a day
        //example start=23:00, end equals 03:00
        if (endDateTime.isBefore(startDateTime)) {
            endDateTime = endDateTime.add(1, 'day');
        }

        let data = {
            chargeStartTime: startDateTime.format('iso'),
            chargeStopTime: endDateTime.format('iso'),
            repeat: repeat
        };

        return this.#postWaitForResponse(`/api/chargers/${chargerId}/basic_charge_plan`, data)
            .then(function (result) {
                return result;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    deleteBasicChargePlan = function (chargerId) {
        return invoke(config.apiDomain, 'delete', this, `/api/chargers/${chargerId}/basic_charge_plan`)
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

    getDynamicCircuitCurrent = function (siteId, circuitId) {

        if (!isInt(siteId) || !isInt(circuitId)) {
            return Promise.reject(new Error(`Site Id and/or Circuit Id is empty! Please try and restart the Easee app. Verify the Id's in the settings view of the charger device.`));
        }

        return invoke(config.apiDomain, 'get', this, `/api/sites/${siteId}/circuits/${circuitId}/dynamicCurrent`)
            .then(function (dynamicCurrent) {
                return dynamicCurrent;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getBasicChargePlan = function (chargerId) {
        return invoke(config.apiDomain, 'get', this, `/api/chargers/${chargerId}/basic_charge_plan`)
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

    getChargerConfig = function (chargerId) {
        return invoke(config.apiDomain, 'get', this, `/api/chargers/${chargerId}/config`)
            .then(function (config) {
                return config;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getChargerDetails = function (chargerId) {
        return invoke(config.apiDomain, 'get', this, `/api/chargers/${chargerId}/details`)
            .then(function (details) {
                return details;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }
/*
    getChargerState = function (chargerId) {
        return invoke(config.apiDomain, 'get', this, `/api/chargers/${chargerId}/state`)
            .then(function (state) {
                return state;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }
*/
    getChargerState = function (chargerId) {
        return invoke(config.apiDomainCom, 'get', this, `/state/${chargerId}/observations?ids=${STATE_OBSERVATION_IDS.join(',')}`)
            .then(function (state) {
                return state.observations || [];
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getChargerSettings = function (chargerId) {
        return invoke(config.apiDomainCom, 'get', this, `/state/${chargerId}/observations?ids=${SETTINGS_OBSERVATION_IDS.join(',')}`)
            .then(function (state) {
                return state.observations || [];
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getSiteInfo = function (chargerId) {
        return invoke(config.apiDomain, 'get', this, `/api/chargers/${chargerId}/site`)
            .then(function (site) {
                return site;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getChargers = function () {
        return invoke(config.apiDomain, 'get', this, '/api/accounts/products')
            .then(function (results) {
                let chargersArr = [];
                results.forEach(result => {
                    //Circuits array can be null
                    if (result.circuits) {
                        result.circuits.forEach(circuit => {
                            if (circuit.chargers) {
                                circuit.chargers.forEach(charger => {
                                    chargersArr.push(charger);
                                });
                            }
                        });
                    }
                });
                return chargersArr;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getEqualizers = function () {
        return invoke(config.apiDomain, 'get', this, '/api/accounts/products')
            .then(function (results) {
                let equalizersArr = [];
                results.forEach(result => {
                    //Maybe also equalizers array can be null
                    if (result.equalizers) {
                        result.equalizers.forEach(equalizer => {
                            equalizersArr.push(equalizer);
                        });
                    }
                });
                return equalizersArr;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getEqualizerSiteInfo = function (equalizerId) {
        return invoke(config.apiDomain, 'get', this, `/api/equalizers/${equalizerId}/site`)
            .then(function (site) {
                return site;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getEqualizerState = function (equalizerId) {
        return invoke(config.apiDomain, 'get', this, `/api/equalizers/${equalizerId}/state`)
            .then(function (state) {
                return state;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getEqualizerConfig = function (equalizerId) {
        return invoke(config.apiDomain, 'get', this, `/api/equalizers/${equalizerId}/config`)
            .then(function (state) {
                return state;
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getLast30DaysChargekWh = function (chargerId) {
        let fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 30)
        let fromDateString = fromDate.toISOString();
        let toDateString = new Date().toISOString();

        return invoke(config.apiDomain, 'get', this, `/api/sessions/charger/${chargerId}/total/${fromDateString}/${toDateString}`)
            .then(function (stats) {
                if (!isNaN(stats)) {
                    return parseFloat(Number(stats).toFixed(2));
                } else {
                    return 0;
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getLastMonthChargekWh = function (chargerId) {
        let today = new Date();
        let fromDateString = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
        let toDateString = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59).toISOString();

        return invoke(config.apiDomain, 'get', this, `/api/sessions/charger/${chargerId}/total/${fromDateString}/${toDateString}`)
            .then(function (stats) {
                if (!isNaN(stats)) {
                    return parseFloat(Number(stats).toFixed(2));
                } else {
                    return 0;
                }
            })
            .catch(reason => {
                return Promise.reject(reason);
            });
    }

    getLastChargeSessionkWh = function (chargerId) {
        //Look for sessions in last week
        let fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7)
        let fromDateString = fromDate.toISOString();
        let toDateString = new Date().toISOString();

        return invoke(config.apiDomain, 'get', this, `/api/sessions/charger/${chargerId}/sessions/${fromDateString}/${toDateString}`)
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

    _logMessage(level, ...msg) {
        //If debug is true then ignore level
        if (this.options.debug) {
            this.#log(...msg);
        } else if (level == 'INFO') {
            this.#log(...msg);
        }
    }

    #log(...msg) {
        if (this.options.device) {
            this.options.device.log(...msg);
        } else {
            console.log(...msg);
        }
    }
}
module.exports = Easee;

async function invoke(domain, method, self, path, data) {
    const statEndpoint = `${method}:${resolvePathForStats(path)}`;
    if (self.stats) self.stats.countInvocation(statEndpoint);
    let options = {
        timeout: config.apiTimeout,
        protocol: config.apiProtocol,
        hostname: domain,
        path: path,
        headers: {
            'Accept-Encoding': 'br, gzip, deflate',
            'Accept-Language': 'en-us',
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': '*/*',
            'Authorization': `Bearer ${self.options.accessToken}`,
            'User-Agent': `${config.userAgent}/${self.options.appVersion}`
        }
    };

    if (data && method == 'post') {
        options.json = data;
    }

    let result = {
        response: {
            statusCode: -1
        }
    };
    try {
        if (method == 'post') {
            result = await Https.post(options);
        } else if (method == 'get') {
            result = await Https.get(options);
        } else if (method == 'delete') {
            result = await Https.delete(options);
        }
        if (result.response.statusCode > 199 && result.response.statusCode < 300) {
            try {
                let json = JSON.parse(result.data);
                //Append http response code
                json.statusCode = result.response.statusCode;
                return Promise.resolve(json);
            } catch (error) {
                return Promise.resolve(result.data);
            }
        } else if (result.response.statusCode == 401) {
            if (self.stats) self.stats.countError(statEndpoint, '401 (Access token expired)');
            return Promise.reject(new Error(`${method} '${path}': Access token expired (${result.response.statusCode})`));
        } else if (result.response.statusCode == 502) {
            if (self.stats) self.stats.countError(statEndpoint, '502 (Rate limit exceeded)');
            return Promise.reject(new Error(`${method} '${path}': Rate limit exceeded (${result.response.statusCode})`));
        } else {
            if (self.stats) self.stats.countError(statEndpoint, `${result.response.statusCode}`);
            return Promise.reject(new Error(`${method} '${path}': Failed, HTTP status code '${result.response.statusCode}'`));
        }
    } catch (error) {
        return Promise.reject(error);
    }
}

function resolvePathForStats(path) {
    const commandPath = '/api/commands/';
    const observationsPath = '/observations';
    let fixedPath = path;
    //To many unique paths for commands API, remove the unique part
    if (path.startsWith(commandPath)) {
        const endPos = path.substring(commandPath.length).indexOf('/') + 1;
        fixedPath = path.substring(0, commandPath.length + endPos);
        fixedPath = fixedPath + '...'
    } else if (path.indexOf(observationsPath) > -1) {
        const endPos = path.substring(observationsPath.length).indexOf('?') + 1;
        fixedPath = path.substring(0, observationsPath.length + endPos);
        fixedPath = fixedPath + '...'
    }

    return fixedPath;
}

function isInt(value) {
    return !isNaN(value) && (function (x) { return (x | 0) === x; })(parseFloat(value))
}

function awaitSuccessfulCommandInvocation(self, data) {
    //This logic is only relevant for http status code 202
    if (data.statusCode != 202) {
        return Promise.resolve(true);
    }

    //Execute getCommandStatus each 500ms until we get a success or fail response
    return runFor(() => getCommandStatus(self, data), 500, self)
        .then(function (response) {
            return Promise.resolve(response);
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

function getCommandStatus(self, data) {
    return invoke(config.apiDomain, 'get', self, `/api/commands/${data.device}/${data.commandId}/${data.ticks}`)
        .then(function (response) {
            self._logMessage('INFO', `Accepted: '${response.wasAccepted}', result: '${enums.decodeCommandState(response.resultCode)}'`);
            return Promise.resolve(response);
        })
        .catch(reason => {
            return Promise.reject(reason);
        });
}

const maxRetries = 50;
const timeoutPromise = (timeout) => new Promise((resolve) => setTimeout(resolve, timeout));
const runFor = async (func, interval, self) => {
    let done = false;
    let errorMsg;
    let counter = 0;
    while (!done && counter < maxRetries) {
        counter++;
        await timeoutPromise(interval);
        await func()
            .then(function (response) {
                if (response.wasAccepted) {
                    //Lets skip checking resultCode, the command was accepted
                    self._logMessage('INFO', `Command accepted`);
                    done = true;
                } else if (response.resultCode == 2) {
                    errorMsg = `Easee Cloud: Command expired`;
                    done = true;
                } else if (response.resultCode == 3) {
                    errorMsg = `Easee Cloud: Command wasn't accepted`;
                    done = true;
                } else if (response.resultCode == 4) {
                    errorMsg = `Easee Cloud: Command rejected`;
                    done = true;
                }
            })
            .catch(reason => {
                //Endpoint may give 404 initially until available
                if (reason.message.indexOf('404') > -1) {
                    self._logMessage('INFO', `Got a 404 error from commands API, attempt ${counter}...`);
                } else {
                    return Promise.reject(reason);
                }
            });
    }

    if (errorMsg) {
        return Promise.reject(new Error(errorMsg));
    } else if (counter >= maxRetries) {
        return Promise.reject(new Error(`Command didn't return a state after '${counter}' attempts!`));
    } else {
        return Promise.resolve(true);
    }
};
