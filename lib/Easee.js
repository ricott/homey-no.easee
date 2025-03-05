'use strict';
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

    async #postWaitForResponse(url, payload) {
        this._logMessage('INFO', `Invoking url '${url}'`);

        try {
            const result = await invoke(config.apiDomain, 'post', this, url, payload);
            this._logMessage('INFO', `Command result: ${JSON.stringify(result)}`);

            // Handle the new response format that might include statusCode and text properties
            if (result && typeof result === 'object') {
                // For empty responses with successful status code
                if (result.isEmpty && result.statusCode >= 200 && result.statusCode < 300) {
                    this._logMessage('INFO', `Received empty response with status code ${result.statusCode}. Considering command successful.`);
                    return true;
                }
                
                // If the status code is in the success range (200-299), consider it a success
                // regardless of whether there was a JSON parsing error
                if (result.statusCode >= 200 && result.statusCode < 300) {
                    // Even if there was an error parsing JSON, if the status code is successful,
                    // we'll consider the command successful
                    if (result.error && result.error.includes("Unexpected end of JSON input")) {
                        this._logMessage('INFO', `Received success status code (${result.statusCode}) with empty or invalid JSON response. Considering command successful.`);
                        return true;
                    }
                    
                    // For other text responses with successful status
                    if (result.text) {
                        return true;
                    }
                }
                
                // For actual errors
                if (result.error) {
                    throw new Error(`Command failed: ${result.error}`);
                }
            }

            // If result is an empty array, it means the command was accepted immediately
            if (Array.isArray(result) && result.length === 0) {
                return true;
            }

            // If result is an array with a command object, use the first item
            if (Array.isArray(result) && result.length > 0 && result[0].commandId) {
                const commandResult = await awaitSuccessfulCommandInvocation(this, result[0]);
                return commandResult;
            }

            // For non-array responses, proceed as before
            const commandResult = await awaitSuccessfulCommandInvocation(this, result);
            return commandResult;
        } catch (error) {
            this._logMessage('ERROR', `Command failed: ${error.message}`);
            throw error;
        }
    }

    async rebootCharger(chargerId) {
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/commands/reboot`, {});
    }

    /*
        Allows a charger with 'authorizationRequired' = true to deliver power. 
        Otherwise it will have no effect
    */
    async startCharging(chargerId) {
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/commands/start_charging`, {});
    }

    /*
        Stops a charger with an active authorization from delivering power and 
        revokes authorization. Will have no effect if 'authorizationRequired' is 
        false or charger is not authorized
    */
    async stopCharging(chargerId) {
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/commands/stop_charging`, {});
    }

    /*
        Pauses current charging session but keeps authorization. 
        Limits dynamic charger current to 0.
        Reset on on new car connection
    */
    async pauseCharging(chargerId) {
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/commands/pause_charging`, {});
    }

    /*
        Resumes current charging session. Resets output current limit 
        set in dynamic charger current
    */
    async resumeCharging(chargerId) {
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/commands/resume_charging`, {});
    }

    /*
        Send charging command (Start/Stop or Pause/Resume). 
        For chargers requiring online authorization, start/stop commands are used.
        For chargers without online authorization, pause/resume commands are used.
    */
    async toggleCharging(chargerId) {
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/commands/toggle_charging`, {});
    }

    async overrideSchedule(chargerId) {
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/commands/override_schedule`, {});
    }

    async setAuthorizationRequired(chargerId, authRequired) {
        const data = {
            authorizationRequired: authRequired
        };
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data);
    }

    async enableSmartCharging(chargerId) {
        const data = {
            smartCharging: true,
            smartButtonEnabled: true
        };
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data);
    }

    async disableSmartCharging(chargerId) {
        const data = {
            smartCharging: false,
            smartButtonEnabled: false
        };
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data);
    }

    async pauseSmartCharging(chargerId) {
        const data = {
            smartCharging: false
        };
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data);
    }

    async setChargerState(chargerId, state) {
        const data = {
            enabled: state
        };
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data);
    }

    async enableIdleCurrent(chargerId, state) {
        const data = {
            enableIdleCurrent: state
        };
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data);
    }

    async lockCablePermanently(chargerId, state) {
        const data = {
            lockCablePermanently: state
        };
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data);
    }

    //Accept values 1-100
    async ledStripBrightness(chargerId, brightness) {
        const data = {
            ledStripBrightness: brightness
        };
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data);
    }

    async setDynamicChargerCurrent(chargerId, current) {
        const data = {
            dynamicChargerCurrent: current
        };
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data);
    }

    async setMaxChargerCurrent(chargerId, current) {
        const data = {
            maxChargerCurrent: current
        };
        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/settings`, data);
    }

    async setChargingPrice(siteId, currency, costPerKWh, taxPerKWh) {
        if (!isInt(siteId)) {
            throw new Error(`Site Id is empty! Please try and restart the Easee app. Verify the Site Id in the settings view of the charger device.`);
        }

        let data = {
            currencyId: currency,
            costPerKWh: costPerKWh
        };

        if (taxPerKWh != 0) {
            data.vat = taxPerKWh;
            data.costPerKwhExcludeVat = costPerKWh - taxPerKWh;
        }

        return await invoke(config.apiDomain, 'post', this, `/api/sites/${siteId}/price`, data);
    }

    //These are the values you need to change when doing load balancing
    //Is only set on the master (circuit) on site level. The master will handle circuit load balancing based on this value.
    //This value will be reset if a charger is restarted, and go back to 40A
    //timeToLive How long the limits should be valid in minutes, 0 means forever (default)
    async setDynamicCurrentPerPhase(siteId, circuitId, currentP1, currentP2, currentP3, timeToLive = 0) {
        if (!isInt(siteId) || !isInt(circuitId)) {
            throw new Error(`Site Id and/or Circuit Id is empty! Please try and restart the Easee app. Verify the Id's in the settings view of the charger device.`);
        }

        // Convert string values to integers if they're valid numbers
        if (typeof currentP1 === 'string') currentP1 = parseInt(currentP1, 10);
        if (typeof currentP2 === 'string') currentP2 = parseInt(currentP2, 10);
        if (typeof currentP3 === 'string') currentP3 = parseInt(currentP3, 10);
        if (typeof timeToLive === 'string') timeToLive = parseInt(timeToLive, 10);

        if (!isInt(currentP1) || !isInt(currentP2) || !isInt(currentP3) || !isInt(timeToLive)) {
            throw new Error(`Invalid current values '${currentP1}/${currentP2}/${currentP3}' or timeToLive '${timeToLive}'`);
        }

        const data = {
            phase1: currentP1,
            phase2: currentP2,
            phase3: currentP3,
            timeToLive: timeToLive
        };
        
        this._logMessage('INFO', `Setting dynamic circuit current with data: ${JSON.stringify(data)}`);
        return await this.#postWaitForResponse(`/api/sites/${siteId}/circuits/${circuitId}/settings`, data);
    }

    async setBasicChargePlan(chargerId, startTime, endTime, repeat, timezone) {
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

        const data = {
            chargeStartTime: startDateTime.format('iso'),
            chargeStopTime: endDateTime.format('iso'),
            repeat: repeat
        };

        return await this.#postWaitForResponse(`/api/chargers/${chargerId}/basic_charge_plan`, data);
    }

    async deleteBasicChargePlan(chargerId) {
        try {
            return await invoke(config.apiDomain, 'delete', this, `/api/chargers/${chargerId}/basic_charge_plan`);
        } catch (error) {
            //If you try to delete the charge plan and it is not there you get a 404 error
            if (error.message.includes('404')) {
                return {};
            }
            throw error;
        }
    }

    async getDynamicCircuitCurrent(siteId, circuitId) {
        if (!isInt(siteId) || !isInt(circuitId)) {
            throw new Error(`Site Id and/or Circuit Id is empty! Please try and restart the Easee app. Verify the Id's in the settings view of the charger device.`);
        }

        return await invoke(config.apiDomain, 'get', this, `/api/sites/${siteId}/circuits/${circuitId}/dynamicCurrent`);
    }

    async getBasicChargePlan(chargerId) {
        try {
            return await invoke(config.apiDomain, 'get', this, `/api/chargers/${chargerId}/basic_charge_plan`);
        } catch (error) {
            //If you try to get the charge plan and it is not there you get a 404 error
            if (error.message.includes('404')) {
                return {};
            }
            throw error;
        }
    }

    async getChargerConfig(chargerId) {
        return await invoke(config.apiDomain, 'get', this, `/api/chargers/${chargerId}/config`);
    }

    async getChargerDetails(chargerId) {
        return await invoke(config.apiDomain, 'get', this, `/api/chargers/${chargerId}/details`);
    }

    async getChargerState(chargerId) {
        const state = await invoke(config.apiDomain, 'get', this, `/state/${chargerId}/observations?ids=${STATE_OBSERVATION_IDS.join(',')}`);
        return state.observations || [];
    }

    async getChargerSettings(chargerId) {
        const state = await invoke(config.apiDomain, 'get', this, `/state/${chargerId}/observations?ids=${SETTINGS_OBSERVATION_IDS.join(',')}`);
        return state.observations || [];
    }

    async getSiteInfo(chargerId) {
        return await invoke(config.apiDomain, 'get', this, `/api/chargers/${chargerId}/site`);
    }

    async getChargers() {
        const results = await invoke(config.apiDomain, 'get', this, '/api/accounts/products');
        const chargersArr = [];

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
    }

    async getEqualizers() {
        const results = await invoke(config.apiDomain, 'get', this, '/api/accounts/products');
        const equalizersArr = [];

        results.forEach(result => {
            //Maybe also equalizers array can be null
            if (result.equalizers) {
                result.equalizers.forEach(equalizer => {
                    equalizersArr.push(equalizer);
                });
            }
        });

        return equalizersArr;
    }

    async getEqualizerSiteInfo(equalizerId) {
        return await invoke(config.apiDomain, 'get', this, `/api/equalizers/${equalizerId}/site`);
    }

    async getEqualizerState(equalizerId) {
        return await invoke(config.apiDomain, 'get', this, `/api/equalizers/${equalizerId}/state`);
    }

    async getEqualizerConfig(equalizerId) {
        return await invoke(config.apiDomain, 'get', this, `/api/equalizers/${equalizerId}/config`);
    }

    async getLast30DaysChargekWh(chargerId) {
        let fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 30)
        let fromDateString = fromDate.toISOString();
        let toDateString = new Date().toISOString();

        const stats = await invoke(config.apiDomain, 'get', this, `/api/sessions/charger/${chargerId}/total/${fromDateString}/${toDateString}`);
        if (!isNaN(stats)) {
            return parseFloat(Number(stats).toFixed(2));
        }
        return 0;
    }

    async getLastMonthChargekWh(chargerId) {
        let today = new Date();
        let fromDateString = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
        let toDateString = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59).toISOString();

        const stats = await invoke(config.apiDomain, 'get', this, `/api/sessions/charger/${chargerId}/total/${fromDateString}/${toDateString}`);
        if (!isNaN(stats)) {
            return parseFloat(Number(stats).toFixed(2));
        }
        return 0;
    }

    async getLastChargeSessionkWh(chargerId) {
        //Look for sessions in last week
        let fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7)
        let fromDateString = fromDate.toISOString();
        let toDateString = new Date().toISOString();

        const sessions = await invoke(config.apiDomain, 'get', this, `/api/sessions/charger/${chargerId}/sessions/${fromDateString}/${toDateString}`);
        let sessionCharge = 0;
        if (sessions[0] && sessions[0].kiloWattHours) {
            sessionCharge = sessions[0].kiloWattHours;
        }
        return sessionCharge;
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

    const url = `https://${domain}${path}`;
    let options = {
        method: method.toUpperCase(),
        headers: {
            'Accept-Encoding': 'br, gzip, deflate',
            'Accept-Language': 'en-us',
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': '*/*',
            'Authorization': `Bearer ${self.options.accessToken}`,
            'User-Agent': `${config.userAgent}/${self.options.appVersion}`
        },
        signal: AbortSignal.timeout(config.apiTimeout)
    };

    if (data && method.toLowerCase() === 'post') {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(url, options);
        const statusCode = response.status;

        if (statusCode >= 200 && statusCode < 300) {
            try {
                const contentType = response.headers.get('content-type');
                
                // Check for empty response - clone the response and get the text first
                const responseText = await response.clone().text();
                if (!responseText || responseText.trim() === '') {
                    self._logMessage('INFO', `Received empty response with status code ${statusCode}`);
                    return { 
                        statusCode,
                        isEmpty: true
                    };
                }
                
                if (contentType && contentType.includes('application/json')) {
                    try {
                        let json = await response.json();
                        json.statusCode = statusCode;
                        return json;
                    } catch (jsonError) {
                        // Handle JSON parsing errors (empty response, invalid JSON)
                        self._logMessage('INFO', `Failed to parse JSON: ${jsonError.message}`);
                        return { 
                            statusCode, 
                            error: `Unexpected end of JSON input`, 
                            details: jsonError.message,
                            responseText: responseText 
                        };
                    }
                } else {
                    // Handle non-JSON response
                    return { statusCode, text: responseText };
                }
            } catch (error) {
                // If we can't parse the response, return an object with status code
                // Don't try to read the body again as it may have been consumed
                return { statusCode, error: error.message };
            }
        } else if (statusCode === 401) {
            if (self.stats) self.stats.countError(statEndpoint, '401 (Access token expired)');
            throw new Error(`${method} '${path}': Access token expired (${statusCode})`);
        } else if (statusCode === 502) {
            if (self.stats) self.stats.countError(statEndpoint, '502 (Rate limit exceeded)');
            throw new Error(`${method} '${path}': Rate limit exceeded (${statusCode})`);
        } else {
            if (self.stats) self.stats.countError(statEndpoint, `${statusCode}`);
            // Don't try to read the body for error responses, just throw with status code
            throw new Error(`${method} '${path}': Failed, HTTP status code '${statusCode}'`);
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`${method} '${path}': Request timed out after ${config.apiTimeout}ms`);
        }
        throw error;
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

async function awaitSuccessfulCommandInvocation(self, data) {
    // If we have a command object (with commandId), we need to poll for its status
    if (data.commandId) {
        self._logMessage('INFO', 'Awaiting result from command execution on charger...');
        //Execute getCommandStatus each 500ms until we get a success or fail response
        return await runFor(() => getCommandStatus(self, data), 500, self);
    }

    return true;
}

async function getCommandStatus(self, data) {
    const response = await invoke(config.apiDomain, 'get', self, `/api/commands/${data.device}/${data.commandId}/${data.ticks}`);
    
    // Handle empty responses
    if (response && typeof response === 'object') {
        // For empty responses with successful status code
        if (response.isEmpty && response.statusCode >= 200 && response.statusCode < 300) {
            self._logMessage('INFO', `Received empty response with status code ${response.statusCode} in command status check`);
            // Create a minimal response object for the caller
            return { wasAccepted: true };
        }
        
        // Handle the response format that might include text or error properties
        if (response.text || response.error) {
            if (response.error) {
                throw new Error(`Command status check failed: ${response.error}`);
            }
            // If it's just a text response with a successful status code, log but can't proceed with command status check
            if (response.statusCode >= 200 && response.statusCode < 300) {
                self._logMessage('INFO', `Received non-JSON response with status code ${response.statusCode}`);
                // Create a minimal response object for the caller
                return { wasAccepted: true };
            }
        }
    }
    
    self._logMessage('INFO', `Accepted: '${response.wasAccepted}', result: '${enums.decodeCommandState(response.resultCode)}'`);
    return response;
}

const maxRetries = 50;
const timeoutPromise = (timeout) => new Promise((resolve) => setTimeout(resolve, timeout));

async function runFor(func, interval, self) {
    let done = false;
    let errorMsg;
    let counter = 0;

    while (!done && counter < maxRetries) {
        counter++;
        await timeoutPromise(interval);

        try {
            const response = await func();

            // Make sure response is a proper object
            if (!response || typeof response !== 'object') {
                self._logMessage('INFO', `Received unexpected response format: ${JSON.stringify(response)}`);
                continue;
            }

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
        } catch (error) {
            //Endpoint may give 404 initially until available
            if (error.message.includes('404')) {
                self._logMessage('INFO', `Got a 404 error from commands API, attempt ${counter}...`);
            } else {
                self._logMessage('ERROR', `Error checking command status: ${error.message}`);
                errorMsg = `Error checking command status: ${error.message}`;
                done = true;
            }
        }
    }

    if (errorMsg) {
        throw new Error(errorMsg);
    } else if (counter >= maxRetries) {
        throw new Error(`Command didn't return a state after '${counter}' attempts!`);
    }

    return true;
}
