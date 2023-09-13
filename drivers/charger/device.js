'use strict';
const Homey = require('homey');
const Easee = require('../../lib/Easee.js');
const enums = require('../../lib/enums.js');
const crypto = require('crypto');
const TokenManager = require('../../lib/tokenManager.js');
const algorithm = 'aes-256-cbc';

const deviceCapabilitesList = [
    'charger_status',
    'enabled',
    'measure_current.offered',
    'measure_power',
    'measure_current.p1',
    'measure_current.p2',
    'measure_current.p3',
    'measure_voltage',
    'meter_power.lastCharge',
    'meter_power',
    'measure_charge',
    'measure_charge.last_month',
    'onoff',
    'target_charger_current',
    'target_circuit_current'
];

class ChargerDevice extends Homey.Device {

    async onInit() {
        // Register device triggers
        //This trigger is triggered automatically by homey when capability value changes
        this.homey.flow.getDeviceTriggerCard('target_charger_current_changed');
        this.homey.flow.getDeviceTriggerCard('onoff_true');
        this.homey.flow.getDeviceTriggerCard('onoff_false');
        this._charger_status_changed = this.homey.flow.getDeviceTriggerCard('charger_status_changed');
        this._charger_status_changedv2 = this.homey.flow.getDeviceTriggerCard('charger_status_changedv2');
        this._charger_status_changedv2.registerRunListener(async (args, state) => {
            this.log(`Comparing '${args.status.name}' with '${state.status}'`);
            return args.status.name == state.status;
        });
        this._charger_status_changedv2.registerArgumentAutocompleteListener('status',
            async (query, args) => {
                return enums.getChargerMode();
            }
        );

        await this.setupCapabilityListeners();

        this.charger = {
            log: []
        };

        this.logMessage(`Easee charger initiated, '${this.getName()}'`);

        //App was restarted, Zero out last error field
        this.updateSetting('easee_last_error', '');

        this.tokenManager = TokenManager;

        await this.setupCapabilities();

        if (!this.homey.settings.get(`${this.getData().id}.username`)) {
            //This is a newly added device, lets copy login details to homey settings
            this.logMessage(`Storing credentials for user '${this.getStoreValue('username')}'`);
            this.storeCredentialsEncrypted(this.getStoreValue('username'), this.getStoreValue('password'));
        }

        let self = this;
        //Force renewal of token, if a user restarts the app a new token should be generated
        self.tokenManager.getTokens(self.getUsername(), self.getPassword(), true)
            .then(function (tokens) {
                self.setToken(tokens);

                self.refreshChargerSettings();
                self.updateChargerSiteInfo();
                self.updateChargerStatistics();
                self._initilializeTimers();
            }).catch(reason => {
                self.logMessage(reason);
            });
    }

    async setupCapabilityListeners() {
        this.registerCapabilityListener('onoff', async (value) => {
            if (value) {
                //Start
                await this.startCharging()
                    .catch(reason => {
                        let defaultMsg = 'Failed to start charging!';
                        return Promise.reject(new Error(this.createFriendlyErrorMsg(reason, defaultMsg)));
                    });

            } else {
                //Stop
                await this.stopCharging()
                    .catch(reason => {
                        let defaultMsg = 'Failed to stop charging!';
                        return Promise.reject(new Error(this.createFriendlyErrorMsg(reason, defaultMsg)));
                    });
            }
        });

        this.registerCapabilityListener('target_circuit_current', async (current) => {
            this.logMessage(`Set dynamic circuit current to '${current}'`);
            await this.setDynamicCurrentPerPhase(current, current, current)
                .catch(reason => {
                    let defaultMsg = 'Failed to set dynamic circuit current!';
                    return Promise.reject(new Error(this.createFriendlyErrorMsg(reason, defaultMsg)));
                });
        });

        this.registerCapabilityListener('target_charger_current', async (current) => {
            this.logMessage(`Set dynamic charger current to '${current}'`);
            //Adjust dynamic current to be <= max charger current
            const newCurrent = Math.min(this.getSettings().maxChargerCurrent, current);
            await this.setDynamicChargerCurrent(newCurrent)
                .catch(reason => {
                    let defaultMsg = 'Failed to set dynamic charger current!';
                    return Promise.reject(new Error(this.createFriendlyErrorMsg(reason, defaultMsg)));
                });
        });

        this.registerCapabilityListener('button.organize', async () => {
            //Delete all capabilities and then add them in right order
            this.logMessage(`Reorganizing all capabilities to correct order`);
            this.getCapabilities().forEach(capability => {
                if (capability != 'button.organize' && capability != 'button.reconnect') {
                    this.removeCapabilityHelper(capability);
                }
            });

            this.#sleep(2000).then(() => {
                deviceCapabilitesList.forEach(capability => {
                    if (capability != 'measure_charge' && capability != 'measure_charge.last_month') {
                        //All other fields should be added
                        this.addCapabilityHelper(capability);
                    } else if ((capability === 'measure_charge' && this.getSetting('showLast30daysStats')) ||
                        (capability === 'measure_charge.last_month' && this.getSetting('showLastMonthStats'))) {
                        //Add if configured to be shown
                        this.logMessage(`Adding capability based on configuration '${capability}'`);
                        this.addCapabilityHelper(capability);
                    }
                });
            });

            return Promise.resolve(true);
        });

        this.registerCapabilityListener('button.reconnect', async () => {
            this.logMessage(`Reconnect to Easee Cloud API`);
            await this.refreshAccessToken(true);
            return Promise.resolve(true);
        });
    }

    getToken() {
        return this.getStoreValue('tokens');
    }

    setToken(tokens) {
        this.setStoreValue('tokens', tokens);
    }

    async removeCapabilityHelper(capability) {
        if (this.hasCapability(capability)) {
            try {
                this.logMessage(`Remove existing capability '${capability}'`);
                await this.removeCapability(capability);
            } catch (reason) {
                this.error(`Failed to removed capability '${capability}'`);
                this.error(reason);
            }
        }
    }
    async addCapabilityHelper(capability) {
        if (!this.hasCapability(capability)) {
            try {
                this.logMessage(`Adding missing capability '${capability}'`);
                await this.addCapability(capability);
            } catch (reason) {
                this.error(`Failed to add capability '${capability}'`);
                this.error(reason);
            }
        }
    }

    async updateCapabilityOptions(capability, options) {
        if (this.hasCapability(capability)) {
            try {
                this.logMessage(`Updating capability options '${capability}'`);
                await this.setCapabilityOptions(capability, options);
            } catch (reason) {
                this.error(`Failed to update capability options for '${capability}'`);
                this.error(reason);
            }
        }
    }

    fetchCapabilityOptions(capability) {
        let options = {};
        if (this.hasCapability(capability)) {
            try {
                //this.logMessage(`Trying to fetch capability options for '${capability}'`);
                options = this.getCapabilityOptions(capability);
            } catch (reason) {
                this.logError(`Failed to fetch capability options for '${capability}', even if it exists!!!`);
                this.logError(reason);
            }
        }
        return options;
    }

    async setupCapabilities() {
        this.logMessage('Setting up capabilities');

        //Add and remove capabilities as part of upgrading a device
        await this.addCapabilityHelper('onoff');
        //Don't want the option of single click in mobile app to start/stop charging
        await this.updateCapabilityOptions('onoff', { uiQuickAction: false });

        await this.addCapabilityHelper('target_circuit_current');
        await this.addCapabilityHelper('target_charger_current');

        await this.removeCapabilityHelper('measure_charge.lifetime');
        await this.removeCapabilityHelper('connected');
        await this.removeCapabilityHelper('current_used');
        await this.removeCapabilityHelper('threePhase');
        await this.removeCapabilityHelper('locked');

        await this.addCapabilityHelper('enabled');
        await this.addCapabilityHelper('button.organize');
        await this.addCapabilityHelper('button.reconnect');
        await this.addCapabilityHelper('measure_current.p1');
        await this.addCapabilityHelper('measure_current.p2');
        await this.addCapabilityHelper('measure_current.p3');
        await this.addCapabilityHelper('meter_power.lastCharge');
        await this.addCapabilityHelper('meter_power');

        let capability = 'measure_charge';
        if (!this.hasCapability(capability) && this.getSetting('showLast30daysStats')) {
            await this.addCapabilityHelper(capability);
        } else if (this.hasCapability(capability) && !this.getSetting('showLast30daysStats')) {
            await this.removeCapabilityHelper(capability);
        }

        capability = 'measure_charge.last_month';
        if (!this.hasCapability(capability) && this.getSetting('showLastMonthStats')) {
            await this.addCapabilityHelper(capability);
        } else if (this.hasCapability(capability) && !this.getSetting('showLastMonthStats')) {
            await this.removeCapabilityHelper(capability);
        }
    }

    updateSetting(key, value) {
        let obj = {};
        if (typeof value === 'string' || value instanceof String) {
            obj[key] = value;
        } else {
            //If not of type string then make it string
            obj[key] = String(value);
        }

        this.setSettings(obj).catch(err => {
            this.error(`Failed to update setting '${key}' with value '${value}'`, err);
        });
    }

    logError(error) {
        this.error(error);
        let message = '';
        if (this.isError(error)) {
            message = error.stack;
        } else {
            try {
                message = JSON.stringify(error, null, "  ");
            } catch (e) {
                this.error('Failed to stringify object', e);
                message = error.toString();
            }
        }
        let dateTime = new Date().toISOString();
        this.updateSetting('easee_last_error', dateTime + '\n' + message);
    }

    isError(err) {
        return (err && err.stack && err.message);
    }

    createFriendlyErrorMsg(reason, baseMsg) {
        let errMsg = baseMsg;
        if (reason.message.indexOf('Access token') > -1) {
            errMsg = 'Access token expired';
        } else if (reason.message.indexOf('Rate limit') > -1) {
            errMsg = 'The Easee Cloud API rejected the call due to a rate limit';
        } else {
            errMsg = `${errMsg} ${reason.message}`;
        }

        return errMsg;
    }

    storeCredentialsEncrypted(plainUser, plainPassword) {
        this.logMessage(`Encrypting credentials for user '${plainUser}'`);
        this.homey.settings.set(`${this.getData().id}.username`, this.encryptText(plainUser));
        this.homey.settings.set(`${this.getData().id}.password`, this.encryptText(plainPassword));

        //Remove unencrypted credentials passed from driver
        this.unsetStoreValue('username');
        this.unsetStoreValue('password');
    }

    getUsername() {
        return this.decryptText(this.homey.settings.get(`${this.getData().id}.username`));
    }

    getPassword() {
        return this.decryptText(this.homey.settings.get(`${this.getData().id}.password`));
    }

    encryptText(text) {
        let iv = crypto.randomBytes(16);
        let cipher = crypto.createCipheriv(algorithm, Buffer.from(Homey.env.ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
    }

    decryptText(text) {
        let iv = Buffer.from(text.iv, 'hex');
        let encryptedText = Buffer.from(text.encryptedData, 'hex');
        let decipher = crypto.createDecipheriv(algorithm, Buffer.from(Homey.env.ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

    refreshAccessToken(force) {
        let self = this;
        return self.tokenManager.getTokens(self.getUsername(), self.getPassword(), force)
            .then(function (tokens) {
                if (self.getToken().accessToken != tokens.accessToken) {
                    self.logMessage('We have a new access token from TokenManager');
                }
                self.setToken(tokens);
                return Promise.resolve(true);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    createEaseeChargerClient() {
        let options = {
            accessToken: this.getToken().accessToken,
            appVersion: this.homey.app.getAppVersion(),
            device: this
        };
        return new Easee(options, this.homey.app.getStats());
    }

    /*
        Different observations to read depending on grid type TN or IT
        For IT grid
        inCurrentT1=PE, inCurrentT2=L1, inCurrentT3=L2, inCurrentT4=L3, inCurrentT5=<not used>
        For TN grid
        inCurrentT1=PE, inCurrentT2=N, inCurrentT3=L1, inCurrentT4=L2, inCurrentT5=L3
    */
    refreshChargerState() {
        let self = this;
        self.createEaseeChargerClient().getChargerState(self.getData().id)
            .then(function (observations) {

                const gridType = self.getSetting('detectedPowerGridType');
                let targetCurrent = 0;
                try {
                    observations.forEach(observation => {
                        switch (observation.id) {
                            case 31:
                                self._updateProperty('enabled', observation.value);
                                break;

                            case 48:
                                self._updateProperty('target_charger_current',
                                    Math.min(self.getSettings().maxChargerCurrent, observation.value));
                                break;

                            case 109:
                                self._updateProperty('charger_status', enums.decodeChargerMode(observation.value));

                                if (enums.decodeChargerMode(observation.value) == enums.decodeChargerMode('Charging')) {
                                    self._updateProperty('onoff', true);
                                } else {
                                    self._updateProperty('onoff', false);
                                }
                                break;

                            case 111:
                            case 112:
                            case 113:
                                targetCurrent = Math.max(targetCurrent, observation.value);
                                break;

                            case 114:
                                self._updateProperty('measure_current.offered', observation.value);
                                break;

                            case 120:
                                // Convert kW to W
                                self._updateProperty('measure_power', Math.round(observation.value * 1000));
                                break;

                            case 121:
                                self._updateProperty('meter_power.lastCharge', observation.value);
                                break;

                            case 124:
                                self._updateProperty('meter_power', observation.value);
                                break;

                            case 182:
                                // InCurrent_T2
                                if (gridType === enums.DETECTED_POWER_GRID_TYPE.IT_3_PHASE.key ||
                                    gridType === enums.DETECTED_POWER_GRID_TYPE.IT_1_PHASE.key) {
                                    self._updateProperty('measure_current.p1', observation.value);
                                }
                                break;

                            case 183:
                                // InCurrent_T3
                                if (gridType === enums.DETECTED_POWER_GRID_TYPE.IT_3_PHASE.key ||
                                    gridType === enums.DETECTED_POWER_GRID_TYPE.IT_1_PHASE.key) {
                                    self._updateProperty('measure_current.p2', observation.value);
                                } else {
                                    self._updateProperty('measure_current.p1', observation.value);
                                }
                                break;
                            case 184:
                                // InCurrent_T4
                                if (gridType === enums.DETECTED_POWER_GRID_TYPE.IT_3_PHASE.key ||
                                    gridType === enums.DETECTED_POWER_GRID_TYPE.IT_1_PHASE.key) {
                                    self._updateProperty('measure_current.p3', observation.value);
                                } else {
                                    self._updateProperty('measure_current.p2', observation.value);
                                }
                                break;
                            case 185:
                                // InCurrent_T5
                                if (gridType != enums.DETECTED_POWER_GRID_TYPE.IT_3_PHASE.key &&
                                    gridType != enums.DETECTED_POWER_GRID_TYPE.IT_1_PHASE.key) {
                                    self._updateProperty('measure_current.p3', observation.value);
                                }
                                break;

                            case 194:
                                // InVolt_T2_T3
                                // Parse as int to skip decimals
                                self._updateProperty('measure_voltage', parseInt(observation.value));
                                break;
                        }
                    });

                    const capability = 'target_circuit_current';
                    // Trying to deal with athom's capability bugs ...
                    const options = self.fetchCapabilityOptions(capability);
                    if (options.max) {
                        targetCurrent = Math.min(options.max, targetCurrent);
                    }
                    self._updateProperty(capability, targetCurrent);

                } catch (error) {
                    self.logError(error);
                }

            }).catch(reason => {
                self.logError(reason);
            });
    }

    refreshChargerSettings() {
        let self = this;
        self.createEaseeChargerClient().getChargerSettings(self.getData().id)
            .then(async function (observations) {

                let settings = {
                    detectedPowerGridType: '',
                    lockCablePermanently: '',
                    idleCurrent: '',
                    phaseMode: '',
                    authorizationRequired: '',
                    offlineChargingMode: '',
                    maxChargerCurrent: 0,
                    maxOfflineCurrent: 0,
                    version: '',
                    reasonForNoCurrent: '',
                    smartCharging: '',
                    nodeType: ''
                };

                observations.forEach(observation => {
                    switch (observation.id) {
                        case 21:
                            settings.detectedPowerGridType = enums.decodePowerGridType(observation.value);
                            break;
                        case 30:
                            settings.lockCablePermanently = observation.value ? 'Yes' : 'No';
                            break;
                        case 37:
                            settings.idleCurrent = observation.value ? 'Yes' : 'No';
                            break;
                        case 38:
                            settings.phaseMode = enums.decodePhaseMode(observation.value);
                            break;
                        case 42:
                            settings.authorizationRequired = observation.value ? 'Yes' : 'No';
                            break;
                        case 45:
                            //Currently not working in the observation api 2023-03-01
                            //self.log(`${observation.id}: ${observation.value}`);
                            settings.offlineChargingMode = enums.decodeOfflineChargingModeType(observation.value);
                            break;
                        case 47:
                            settings.maxChargerCurrent = observation.value;
                            break;
                        case 50: //MaxOfflineCurrent_P1
                        case 51: //MaxOfflineCurrent_P2
                        case 52: //MaxOfflineCurrent_P3
                            //Take the largest maxOfflineCurrent_P1-P3 value
                            settings.maxOfflineCurrent = Math.max(settings.maxOfflineCurrent, observation.value);
                            break;
                        case 80:
                            settings.version = String(observation.value);
                            break;
                        case 96:
                            settings.reasonForNoCurrent = enums.decodeReasonForNoCurrent(observation.value);
                            break;
                        case 102:
                            settings.smartCharging = observation.value ? 'Yes' : 'No';
                            break;
                        case 146:
                            settings.nodeType = enums.decodeNodeType(observation.value);
                            break;
                    }
                });

                const capability = 'target_charger_current';
                if (self.hasCapability(capability)) {
                    // Trying to deal with athom's capability bugs ...
                    const options = self.fetchCapabilityOptions(capability);
                    if (options.max) {
                        if (options.max != settings.maxChargerCurrent) {
                            self.logMessage(`Updating '${capability}' max value to '${settings.maxChargerCurrent}'`);
                            await self.updateCapabilityOptions(capability, { max: settings.maxChargerCurrent });

                            // self.setCapabilityOptions(capability, {
                            //     max: settings.maxChargerCurrent,
                            // }).catch(err => {
                            //     self.error(`Failed to update ${capability} capability options`, err);
                            // });
                        }
                    } else {
                        self.logMessage(`Failed to read capability options max of '${capability}'. Athom bugs ...`);
                    }
                }

                //All settings are strings, some we need as number above
                settings.maxOfflineCurrent = String(settings.maxOfflineCurrent);
                settings.maxChargerCurrent = String(settings.maxChargerCurrent);

                self.setSettings(settings)
                    .catch(err => {
                        self.logError('Failed to update site settings', err);
                    });

            }).catch(reason => {
                self.logError(reason);
            });
    }

    updateChargerStatistics() {
        let self = this;
        if (self.getSetting('showLast30daysStats')) {
            self.logMessage('Getting charger statistics, last 30 days');
            self.createEaseeChargerClient().getLast30DaysChargekWh(self.getData().id)
                .then(function (last30DayskWh) {
                    self._updateProperty('measure_charge', last30DayskWh);
                }).catch(reason => {
                    self.logError(reason);
                });
        }

        if (self.getSetting('showLastMonthStats')) {
            self.logMessage('Getting charger statistics, previous calendar month');
            self.createEaseeChargerClient().getLastMonthChargekWh(self.getData().id)
                .then(function (lastMonthkWh) {
                    self._updateProperty('measure_charge.last_month', lastMonthkWh);
                }).catch(reason => {
                    self.logError(reason);
                });
        }
    }

    //Invoked upon startup of app, refreshed once per day
    updateChargerSiteInfo() {
        let self = this;
        self.logMessage('Getting charger site info');
        const client = self.createEaseeChargerClient();
        client.getSiteInfo(self.getData().id)
            .then(async function (site) {
                const circuitFuse = Math.round(site.circuits[0].ratedCurrent);

                await self.setSettings({
                    mainFuse: `${Math.round(site.ratedCurrent)}`,
                    circuitFuse: `${circuitFuse}`,
                    siteId: `${site.circuits[0].siteId}`,
                    circuitId: `${site.circuits[0].id}`
                }).catch(err => {
                    self.error('Failed to update site settings', err);
                });

            }).catch(reason => {
                self.logError(reason);
            }).finally(() => {
                if (!self.#isInt(self.getSetting('siteId')) || !self.#isInt(self.getSetting('circuitId'))) {
                    //We failed to set circuitId and/or siteId and we have no previous values
                    self.setUnavailable('Failed to retrieve site id and circuit id from Easee Cloud. Please restart the app to retry.')
                        .catch(err => {
                            self.error('Failed to make device unavailable', err);
                        });
                } else {
                    self.setAvailable()
                        .catch(err => {
                            self.error('Failed to make device available', err);
                        });
                }
            });

        client.getChargerDetails(self.getData().id)
            .then(function (details) {

                let partnerName = 'n/a';
                if (details.partner && details.partner.name) {
                    partnerName = details.partner.name;
                }

                self.setSettings({
                    partner: partnerName
                }).catch(err => {
                    self.error('Failed to update partner setting', err);
                });
            }).catch(reason => {
                self.logError(reason);
            });
    }

    pollLifetimeEnergy() {
        let self = this;
        //self.logMessage(`Poll lifetime energy`);
        return self.createEaseeChargerClient().pollLifetimeEnergy(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                //return Promise.reject(reason);
            });
    }

    rebootCharger() {
        let self = this;
        self.logMessage(`Rebooting charger`);
        return self.createEaseeChargerClient().rebootCharger(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    pauseCharging() {
        let self = this;
        self.logMessage(`Pausing charge`);
        return self.createEaseeChargerClient().pauseCharging(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    resumeCharging() {
        let self = this;
        self.logMessage(`Resuming charge`);
        return self.createEaseeChargerClient().resumeCharging(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    // New start method 2022-10-27
    // first trigger start charge, if fails then try resume
    startCharging() {
        let self = this;
        self.logMessage(`Starting charge`);
        const client = self.createEaseeChargerClient();
        const chargerId = self.getData().id;

        return client.startCharging(chargerId)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logMessage('Failed to start charging, lets try resume');
                return client.resumeCharging(chargerId)
                    .then(function (result) {
                        return Promise.resolve(result);
                    })
                    .catch(reason => {
                        self.logMessage('Failed to resume charging, out of luck');
                        self.logError(reason);
                        return Promise.reject(reason);
                    });
            });
    }

    // New stop method 2022-10-27
    // first trigger stop charge, if fails then try pause
    stopCharging() {
        let self = this;
        self.logMessage(`Stopping charge`);
        const client = self.createEaseeChargerClient();
        const chargerId = self.getData().id;

        return client.stopCharging(chargerId)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logMessage('Failed to stop charging, lets try pause');
                return client.pauseCharging(chargerId)
                    .then(function (result) {
                        return Promise.resolve(result);
                    })
                    .catch(reason => {
                        self.logMessage('Failed to pause charging, out of luck');
                        self.logError(reason);
                        return Promise.reject(reason);
                    });
            });
    }

    toggleCharging() {
        let self = this;
        self.logMessage(`Toggling charge`);
        return self.createEaseeChargerClient().toggleCharging(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    overrideSchedule() {
        let self = this;
        self.logMessage(`Overriding schedule`);
        return self.createEaseeChargerClient().overrideSchedule(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    deleteSchedule() {
        let self = this;
        self.logMessage(`Deleting schedule`);
        return self.createEaseeChargerClient().deleteBasicChargePlan(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    createSchedule(startTime, endTime, repeat) {
        let self = this;
        self.logMessage(`Creating schedule, start '${startTime}', end '${endTime}' and repeat '${repeat}'`);
        return self.createEaseeChargerClient().setBasicChargePlan(self.getData().id,
            startTime, endTime, repeat, self.homey.clock.getTimezone())
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    getDynamicCircuitCurrent() {
        let self = this;
        return self.createEaseeChargerClient()
            .getDynamicCircuitCurrent(self.getSetting('siteId'), self.getSetting('circuitId'))
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    setDynamicCurrentPerPhase(currentP1, currentP2, currentP3) {
        let self = this;
        self.logMessage(`Setting dynamic circuit current to '${currentP1}/${currentP2}/${currentP3}'`);
        return self.createEaseeChargerClient()
            .setDynamicCurrentPerPhase(self.getSetting('siteId'), self.getSetting('circuitId'),
                currentP1, currentP2, currentP3)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    setChargingPrice(currency, costPerKWh, taxPerKWh) {
        let self = this;
        self.logMessage(`Setting charging price to '${costPerKWh}' ${currency}`);
        return self.createEaseeChargerClient()
            .setChargingPrice(
                self.getSetting('siteId'),
                currency,
                costPerKWh,
                taxPerKWh)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    setDynamicChargerCurrent(current) {
        let self = this;
        self.logMessage(`Setting dynamic charger current to '${current}'`);
        return self.createEaseeChargerClient().setDynamicChargerCurrent(self.getData().id, current)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    setMaxChargerCurrent(current) {
        let self = this;
        self.logMessage(`Setting charger max current to '${current}'`);
        return self.createEaseeChargerClient().setMaxChargerCurrent(self.getData().id, current)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    setChargerState(state) {
        let self = this;
        self.logMessage(`Setting charger state to '${state}'`);
        return self.createEaseeChargerClient().setChargerState(self.getData().id, state)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    pauseSmartCharging() {
        let self = this;
        self.logMessage(`Pausing smart charging`);
        return self.createEaseeChargerClient().pauseSmartCharging(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    disableSmartCharging() {
        let self = this;
        self.logMessage(`Disabling smart charging`);
        return self.createEaseeChargerClient().disableSmartCharging(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    enableSmartCharging() {
        let self = this;
        self.logMessage(`Enabling smart charging`);
        return self.createEaseeChargerClient().enableSmartCharging(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    enableIdleCurrent(state) {
        let self = this;
        self.logMessage(`Setting enable idle current to '${state}'`);
        return self.createEaseeChargerClient().enableIdleCurrent(self.getData().id, state)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    lockCablePermanently(state) {
        let self = this;
        self.logMessage(`Setting lock cable permanently to '${state}'`);
        return self.createEaseeChargerClient().lockCablePermanently(self.getData().id, state)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    ledStripBrightness(brightness) {
        let self = this;
        self.logMessage(`Setting led strip brightness to '${brightness}'`);
        return self.createEaseeChargerClient().ledStripBrightness(self.getData().id, brightness)
            .then(function (result) {
                return Promise.resolve(result);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    _initilializeTimers() {
        this.logMessage('Adding timers');
        //Update last 30 days kWh
        this.homey.setInterval(() => {
            this.updateChargerStatistics();
        }, 60 * 1000 * 60);

        //Poll charger lifetime energy
        this.homey.setInterval(() => {
            this.pollLifetimeEnergy();
        }, 60 * 1000 * 10);

        //Refresh charger settings
        this.homey.setInterval(() => {
            this.refreshChargerSettings();
        }, 60 * 1000 * 5);

        //Refresh charger state
        this.homey.setInterval(() => {
            this.refreshChargerState();
        }, 30 * 1000);

        //Update once per day for the sake of it
        //Fragile to only run once upon startup if the Easee API doesnt respond at that time
        this.homey.setInterval(() => {
            this.updateChargerSiteInfo();
        }, 24 * 60 * 60 * 1000);

        //Refresh access token, each 2 mins from tokenManager
        this.homey.setInterval(() => {
            this.refreshAccessToken(false);
        }, 60 * 1000 * 2);

        //Update debug info every minute with last 10 messages
        this.homey.setInterval(() => {
            this.updateDebugMessages();
        }, 60 * 1000);
    }

    _updateProperty(key, value) {
        let self = this;
        if (self.hasCapability(key)) {
            if (typeof value !== 'undefined' && value !== null) {
                let oldValue = self.getCapabilityValue(key);
                if (oldValue !== null && oldValue != value) {

                    self.setCapabilityValue(key, value)
                        .then(function () {

                            if (key === 'charger_status') {
                                let tokens = {
                                    status: value
                                }
                                // Old trigger uses token
                                self._charger_status_changed.trigger(self, tokens, {}).catch(error => { self.error(error) });
                                // New trigger uses state
                                self._charger_status_changedv2.trigger(self, {}, tokens).catch(error => { self.error(error) });
                            }

                        }).catch(reason => {
                            self.logError(reason);
                        });
                } else {
                    self.setCapabilityValue(key, value)
                        .catch(reason => {
                            self.logError(reason);
                        });
                }

            } else {
                self.logMessage(`Value for capability '${key}' is 'undefined'`);
            }
        } else {
            self.logMessage(`Trying to set value for missing capability '${key}'`);
        }
    }

    onDeleted() {
        this.log(`Deleting Easee charger '${this.getName()}' from Homey.`);

        this.homey.settings.unset(`${this.getData().id}.username`);
        this.homey.settings.unset(`${this.getData().id}.password`);
        this.charger = null;
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        let fieldsChanged = false;

        if (changedKeys.indexOf("showLast30daysStats") > -1) {
            this.logMessage('showLast30daysStats changed to:', newSettings.showLast30daysStats);
            fieldsChanged = true;
        }
        if (changedKeys.indexOf("showLastMonthStats") > -1) {
            this.logMessage('showLastMonthStats changed to:', newSettings.showLastMonthStats);
            fieldsChanged = true;
        }

        if (fieldsChanged) {
            this.setupCapabilities();
        }
    }

    logMessage(message) {
        this.log(`[${this.getName()}] ${message}`);
        if (this.charger.log.length > 49) {
            //Remove oldest entry
            this.charger.log.shift();
        }
        //Add new entry
        let dateTime = new Date().toISOString();
        this.charger.log.push(dateTime + ' ' + message + '\n');
    }

    getLogMessages() {
        if (this.charger && this.charger.log) {
            return this.charger.log.toString();
        } else {
            return '';
        }
    }

    updateDebugMessages() {
        this.setSettings({
            log: this.getLogMessages()
        }).catch(err => {
            this.error('Failed to update debug messages', err);
        });
    }

    #sleep(time) {
        return new Promise((resolve) => this.homey.setTimeout(resolve, time));
    }

    #isInt(value) {
        return !isNaN(value) && (function (x) { return (x | 0) === x; })(parseFloat(value))
    }
}

module.exports = ChargerDevice;
