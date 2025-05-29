'use strict';
const Homey = require('homey');
const Easee = require('../../lib/Easee.js');
const enums = require('../../lib/enums.js');
const crypto = require('crypto');
const TokenManager = require('../../lib/tokenManager.js');
const algorithm = 'aes-256-cbc';

const deviceClass = 'evcharger';

class ChargerDevice extends Homey.Device {
    mapChargerStateToEnum(mode) {
        switch (mode) {
            case 'Charging':
                return 'plugged_in_charging';
            case 'Paused':
                return 'plugged_in_paused';
            case 'Discharging':
                return 'plugged_in_discharging';

            // "Ready", "AwaitingStart", "AwaitingAuthentication", "CarConnected", "Locked", "Connected"
            // all mean plugged in but not charging
            case 'Ready':
            case 'AwaitingStart':
            case 'AwaitingAuthentication':
            case 'CarConnected':
            case 'Locked':
            case 'Connected':
            case 'Finished': // Charging completed but still plugged in
                return 'plugged_in';

            // Disconnected, Unplugged, NoCarConnected, Error, Completed, Disconnected
            case 'Disconnected':
            case 'Unplugged':
            case 'NoCarConnected':
            case 'Error': // Error is ambiguous, but usually means not charging and maybe not plugged
            case 'Completed': // Sometimes used for unplugged after charge
                return 'plugged_out';

            default:
                return 'plugged_out';
        }
    }

    async onInit() {
        this.logMessage(`Easee charger initialized, '${this.getName()}'`);
        this.tokenManager = TokenManager;

        // Change device class to evcharger if not already
        if (this.getClass() !== deviceClass) {
            await this.setClass(deviceClass);
        }

        // Setup capabilities
        await this.setupCapabilities();
        await this.setupCapabilityListeners();

        this.charger = {
            log: []
        };

        //App was restarted, Zero out last error field
        this.updateSetting('easee_last_error', '');

        if (!this.homey.settings.get(`${this.getData().id}.username`)) {
            //This is a newly added device, lets copy login details to homey settings
            this.storeCredentialsEncrypted(this.getStoreValue('username'), this.getStoreValue('password'));
        }

        let self = this;
        //Force renewal of token, if a user restarts the app a new token should be generated
        self.tokenManager
            .getToken(self.getUsername(), self.getPassword(), true)
            .then(function (token) {
                self.setToken(token);

                self.refreshChargerSettings();
                self.updateChargerSiteInfo();
                self.updateChargerStatistics();
                self._initilializeTimers();
            })
            .catch((reason) => {
                self.logMessage(reason);
            });
    }

    async setupCapabilityListeners() {
        // Homey 12.4.5+: New mandatory EV charger capabilities
        this.registerCapabilityListener('evcharger_charging', async (value) => {
            this.logMessage(`[EV] Homey set evcharger_charging: ${value}`);
            if (value) {
                await this.startCharging().catch((reason) => {
                    let defaultMsg = 'Failed to start charging!';
                    return Promise.reject(new Error(this.createFriendlyErrorMsg(reason, defaultMsg)));
                });
            } else {
                await this.stopCharging().catch((reason) => {
                    let defaultMsg = 'Failed to stop charging!';
                    return Promise.reject(new Error(this.createFriendlyErrorMsg(reason, defaultMsg)));
                });
            }
        });

        this.registerCapabilityListener('target_circuit_current', async (current) => {
            this.logMessage(`Set dynamic circuit current to '${current}'`);
            await this.setDynamicCurrentPerPhase(current, current, current).catch((reason) => {
                let defaultMsg = 'Failed to set dynamic circuit current!';
                return Promise.reject(new Error(this.createFriendlyErrorMsg(reason, defaultMsg)));
            });
        });

        this.registerCapabilityListener('target_charger_current', async (current) => {
            this.logMessage(`Set dynamic charger current to '${current}'`);
            await this.setDynamicChargerCurrent(current).catch((reason) => {
                let defaultMsg = 'Failed to set dynamic charger current!';
                return Promise.reject(new Error(this.createFriendlyErrorMsg(reason, defaultMsg)));
            });
        });
    }

    getToken() {
        return this.getStoreValue('tokens');
    }

    setToken(tokens) {
        this.setStoreValue('tokens', tokens).catch((reason) => {
            this.logError(reason);
        });
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

        // No more onoff! Only EV charger required capabilities
        await this.addCapabilityHelper('target_circuit_current');
        await this.addCapabilityHelper('target_charger_current');
        await this.updateCapabilityOptions('target_charger_current', { max: 40 });

        await this.removeCapabilityHelper('measure_charge.lifetime');
        await this.removeCapabilityHelper('connected');
        await this.removeCapabilityHelper('current_used');
        await this.removeCapabilityHelper('threePhase');
        await this.removeCapabilityHelper('locked');

        await this.addCapabilityHelper('enabled');
        await this.addCapabilityHelper('measure_current.p1');
        await this.addCapabilityHelper('measure_current.p2');
        await this.addCapabilityHelper('measure_current.p3');
        await this.addCapabilityHelper('meter_power.lastCharge');
        await this.addCapabilityHelper('meter_power');

        // Skipping reconnect in favour of repair
        await this.removeCapabilityHelper('button.reconnect');
        await this.removeCapabilityHelper('button.organize');

        // Homey v12.4.5+ mandatory EV charger capabilities
        await this.addCapabilityHelper('evcharger_charging');
        await this.addCapabilityHelper('evcharger_charging_state');

        // Remove deprecated onoff for EV chargers
        await this.removeCapabilityHelper('onoff');

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

        this.setSettings(obj).catch((err) => {
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
                message = JSON.stringify(error, null, '  ');
            } catch (e) {
                this.error('Failed to stringify object', e);
                message = error.toString();
            }
        }
        let dateTime = new Date().toISOString();
        this.updateSetting('easee_last_error', dateTime + '\n' + message);
    }

    isError(err) {
        return err && err.stack && err.message;
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
        this.logMessage(`Storing encrypted credentials for user '${plainUser}'`);
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
        return self.tokenManager
            .getToken(self.getUsername(), self.getPassword(), force)
            .then(function (token) {
                if (self.getToken().accessToken != token.accessToken) {
                    self.logMessage('We have a new access token from TokenManager');
                }
                self.setToken(token);
                return Promise.resolve(true);
            })
            .catch((reason) => {
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
        self.createEaseeChargerClient()
            .getChargerState(self.getData().id)
            .then(function (observations) {
                const gridType = self.getSetting('detectedPowerGridType');
                let targetCircuitCurrent = 0;
                try {
                    observations.forEach((observation) => {
                        switch (observation.id) {
                            case 31:
                                self._updateProperty('enabled', observation.value);
                                break;
                            case 48:
                                self._updateProperty('target_charger_current', observation.value);
                                break;
                            case 109:
                                const chargerModeStr = enums.decodeChargerMode(observation.value);
                                self._updateProperty('charger_status', chargerModeStr);

                                // Only new Homey EV capabilities!
                                const isCharging = chargerModeStr === 'Charging';
                                self._updateProperty('evcharger_charging', isCharging);
                                self._updateProperty('evcharger_charging_state', self.mapChargerStateToEnum(chargerModeStr));
                                break;

                            case 111:
                            case 112:
                            case 113:
                                targetCircuitCurrent = Math.max(targetCircuitCurrent, observation.value);
                                break;
                            case 114:
                                self._updateProperty('measure_current.offered', observation.value);
                                break;
                            case 120:
                                self._updateProperty('measure_power', Math.round(observation.value * 1000));
                                break;
                            case 121:
                                self._updateProperty('meter_power.lastCharge', observation.value);
                                break;
                            case 124:
                                self._updateProperty('meter_power', observation.value);
                                break;
                            case 182:
                                if (gridType === enums.DETECTED_POWER_GRID_TYPE.IT_3_PHASE.key || gridType === enums.DETECTED_POWER_GRID_TYPE.IT_1_PHASE.key) {
                                    self._updateProperty('measure_current.p1', observation.value);
                                }
                                break;
                            case 183:
                                if (gridType === enums.DETECTED_POWER_GRID_TYPE.IT_3_PHASE.key || gridType === enums.DETECTED_POWER_GRID_TYPE.IT_1_PHASE.key) {
                                    self._updateProperty('measure_current.p2', observation.value);
                                } else {
                                    self._updateProperty('measure_current.p1', observation.value);
                                }
                                break;
                            case 184:
                                if (gridType === enums.DETECTED_POWER_GRID_TYPE.IT_3_PHASE.key || gridType === enums.DETECTED_POWER_GRID_TYPE.IT_1_PHASE.key) {
                                    self._updateProperty('measure_current.p3', observation.value);
                                } else {
                                    self._updateProperty('measure_current.p2', observation.value);
                                }
                                break;
                            case 185:
                                if (gridType != enums.DETECTED_POWER_GRID_TYPE.IT_3_PHASE.key && gridType != enums.DETECTED_POWER_GRID_TYPE.IT_1_PHASE.key) {
                                    self._updateProperty('measure_current.p3', observation.value);
                                }
                                break;
                            case 194:
                                self._updateProperty('measure_voltage', parseInt(observation.value));
                                break;
                        }
                    });

                    self._updateProperty('target_circuit_current', targetCircuitCurrent);
                } catch (error) {
                    self.logError(error);
                }
            })
            .catch((reason) => {
                self.logError(reason);
            });
    }

    refreshChargerSettings() {
        let self = this;
        self.createEaseeChargerClient()
            .getChargerSettings(self.getData().id)
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

                observations.forEach((observation) => {
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

                //All settings are strings, some we need as number above
                settings.maxOfflineCurrent = String(settings.maxOfflineCurrent);
                settings.maxChargerCurrent = String(settings.maxChargerCurrent);

                self.setSettings(settings).catch((err) => {
                    self.logError('Failed to update site settings', err);
                });
            })
            .catch((reason) => {
                self.logError(reason);
            });
    }

    updateChargerStatistics() {
        let self = this;
        if (self.getSetting('showLast30daysStats')) {
            self.logMessage('Getting charger statistics, last 30 days');
            self.createEaseeChargerClient()
                .getLast30DaysChargekWh(self.getData().id)
                .then(function (last30DayskWh) {
                    self._updateProperty('measure_charge', last30DayskWh);
                })
                .catch((reason) => {
                    self.logError(reason);
                });
        }

        if (self.getSetting('showLastMonthStats')) {
            self.logMessage('Getting charger statistics, previous calendar month');
            self.createEaseeChargerClient()
                .getLastMonthChargekWh(self.getData().id)
                .then(function (lastMonthkWh) {
                    self._updateProperty('measure_charge.last_month', lastMonthkWh);
                })
                .catch((reason) => {
                    self.logError(reason);
                });
        }
    }

    //Invoked upon startup of app, refreshed once per day
    updateChargerSiteInfo() {
        let self = this;
        self.logMessage('Getting charger site info');
        const client = self.createEaseeChargerClient();
        client
            .getSiteInfo(self.getData().id)
            .then(async function (site) {
                const circuitFuse = Math.round(site.circuits[0].ratedCurrent);

                await self
                    .setSettings({
                        mainFuse: `${Math.round(site.ratedCurrent)}`,
                        circuitFuse: `${circuitFuse}`,
                        siteId: `${site.circuits[0].siteId}`,
                        circuitId: `${site.circuits[0].id}`
                    })
                    .catch((err) => {
                        self.error('Failed to update site settings', err);
                    });
            })
            .catch((reason) => {
                self.logError(reason);
            })
            .finally(() => {
                if (!self.#isInt(self.getSetting('siteId')) || !self.#isInt(self.getSetting('circuitId'))) {
                    //We failed to set circuitId and/or siteId and we have no previous values
                    self.setUnavailable('Failed to retrieve site id and circuit id from Easee Cloud. Please restart the app to retry.').catch((err) => {
                        self.error('Failed to make device unavailable', err);
                    });
                } else {
                    self.setAvailable().catch((err) => {
                        self.error('Failed to make device available', err);
                    });
                }
            });

        client
            .getChargerDetails(self.getData().id)
            .then(function (details) {
                let partnerName = 'n/a';
                if (details.partner && details.partner.name) {
                    partnerName = details.partner.name;
                }

                self.setSettings({
                    partner: partnerName
                }).catch((err) => {
                    self.error('Failed to update partner setting', err);
                });
            })
            .catch((reason) => {
                self.logError(reason);
            });
    }

    rebootCharger() {
        let self = this;
        self.logMessage(`Rebooting charger`);
        return self
            .createEaseeChargerClient()
            .rebootCharger(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    pauseCharging() {
        let self = this;
        self.logMessage(`Pausing charge`);
        return self
            .createEaseeChargerClient()
            .pauseCharging(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    resumeCharging() {
        let self = this;
        self.logMessage(`Resuming charge`);
        return self
            .createEaseeChargerClient()
            .resumeCharging(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    // New start method 2022-10-27
    // first trigger start charge, if fails then try resume
    async startCharging() {
        let self = this;
        self.logMessage(`Starting charge`);
        const client = self.createEaseeChargerClient();
        const chargerId = self.getData().id;

        return client.startChargingSmart(chargerId)
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
    async stopCharging() {
        let self = this;
        self.logMessage(`Stopping charge`);
        const client = self.createEaseeChargerClient();
        const chargerId = self.getData().id;

        return client
            .stopCharging(chargerId)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logMessage('Failed to stop charging, lets try pause');
                return client
                    .pauseCharging(chargerId)
                    .then(function (result) {
                        return Promise.resolve(result);
                    })
                    .catch((reason) => {
                        self.logMessage('Failed to pause charging, out of luck');
                        self.logError(reason);
                        return Promise.reject(reason);
                    });
            });
    }

    async toggleCharging() {
        let self = this;
        self.logMessage(`Toggling charge`);
        return self
            .createEaseeChargerClient()
            .toggleCharging(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    async overrideSchedule() {
        let self = this;
        self.logMessage(`Overriding schedule`);
        return self
            .createEaseeChargerClient()
            .overrideSchedule(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    async deleteSchedule() {
        let self = this;
        self.logMessage(`Deleting schedule`);
        return self
            .createEaseeChargerClient()
            .deleteBasicChargePlan(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    async createSchedule(startTime, endTime, repeat) {
        let self = this;
        self.logMessage(`Creating schedule, start '${startTime}', end '${endTime}' and repeat '${repeat}'`);
        return self
            .createEaseeChargerClient()
            .setBasicChargePlan(self.getData().id, startTime, endTime, repeat, self.homey.clock.getTimezone())
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    async getDynamicCircuitCurrent() {
        let self = this;
        return self
            .createEaseeChargerClient()
            .getDynamicCircuitCurrent(self.getSetting('siteId'), self.getSetting('circuitId'))
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    async setDynamicCurrentPerPhase(currentP1, currentP2, currentP3) {
        let self = this;
        self.logMessage(`Setting dynamic circuit current to '${currentP1}/${currentP2}/${currentP3}'`);
        return self
            .createEaseeChargerClient()
            .setDynamicCurrentPerPhase(self.getSetting('siteId'), self.getSetting('circuitId'), currentP1, currentP2, currentP3)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    async setChargingPrice(currency, costPerKWh, taxPerKWh) {
        let self = this;
        self.logMessage(`Setting charging price to '${costPerKWh}' ${currency}`);
        return self
            .createEaseeChargerClient()
            .setChargingPrice(self.getSetting('siteId'), currency, costPerKWh, taxPerKWh)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    async setDynamicChargerCurrent(current) {
        let self = this;
        self.logMessage(`Setting dynamic charger current to '${current}'`);
        return self
            .createEaseeChargerClient()
            .setDynamicChargerCurrent(self.getData().id, current)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    async setMaxChargerCurrent(current) {
        let self = this;
        self.logMessage(`Setting charger max current to '${current}'`);
        return self
            .createEaseeChargerClient()
            .setMaxChargerCurrent(self.getData().id, current)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    async setChargerState(state) {
        let self = this;
        self.logMessage(`Setting charger state to '${state}'`);
        return self
            .createEaseeChargerClient()
            .setChargerState(self.getData().id, state)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    async pauseSmartCharging() {
        let self = this;
        self.logMessage(`Pausing smart charging`);
        return self
            .createEaseeChargerClient()
            .pauseSmartCharging(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    async disableSmartCharging() {
        let self = this;
        self.logMessage(`Disabling smart charging`);
        return self
            .createEaseeChargerClient()
            .disableSmartCharging(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    async enableSmartCharging() {
        let self = this;
        self.logMessage(`Enabling smart charging`);
        return self
            .createEaseeChargerClient()
            .enableSmartCharging(self.getData().id)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    async enableIdleCurrent(state) {
        let self = this;
        self.logMessage(`Setting enable idle current to '${state}'`);
        return self
            .createEaseeChargerClient()
            .enableIdleCurrent(self.getData().id, state)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    async lockCablePermanently(state) {
        let self = this;
        self.logMessage(`Setting lock cable permanently to '${state}'`);
        return self
            .createEaseeChargerClient()
            .lockCablePermanently(self.getData().id, state)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    async ledStripBrightness(brightness) {
        let self = this;
        self.logMessage(`Setting led strip brightness to '${brightness}'`);
        return self
            .createEaseeChargerClient()
            .ledStripBrightness(self.getData().id, brightness)
            .then(function (result) {
                return Promise.resolve(result);
            })
            .catch((reason) => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    _initilializeTimers() {
        this.logMessage('Adding timers');
        // Update last 30 days kWh
        this.homey.setInterval(() => {
            this.updateChargerStatistics();
        }, 60 * 1000 * 60);

        // Refresh charger settings
        this.homey.setInterval(() => {
            this.refreshChargerSettings();
        }, 60 * 1000 * 5);

        // Refresh charger state
        this.homey.setInterval(() => {
            this.refreshChargerState();
        }, 30 * 1000);

        // Update once per day for the sake of it
        // Fragile to only run once upon startup if the Easee API doesnt respond at that time
        this.homey.setInterval(() => {
            this.updateChargerSiteInfo();
        }, 24 * 60 * 60 * 1000);

        // Refresh access token, each 1 min from tokenManager
        this.homey.setInterval(() => {
            this.refreshAccessToken(false);
        }, 60 * 1000 * 1);

        // Update debug info every minute with last 10 messages
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
                                };
                                self.driver.triggerStatusChanged(self, tokens);
                            }
                        })
                        .catch((reason) => {
                            self.logError(reason);
                        });
                } else {
                    self.setCapabilityValue(key, value).catch((reason) => {
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

        if (changedKeys.indexOf('showLast30daysStats') > -1) {
            this.logMessage('showLast30daysStats changed to:', newSettings.showLast30daysStats);
            fieldsChanged = true;
        }
        if (changedKeys.indexOf('showLastMonthStats') > -1) {
            this.logMessage('showLastMonthStats changed to:', newSettings.showLastMonthStats);
            fieldsChanged = true;
        }

        if (fieldsChanged) {
            this.setupCapabilities();
        }
    }

    logMessage(message) {
        this.log(`[${this.getName()}] ${message}`);
        if (this.charger && this.charger.log) {
            if (this.charger.log.length > 49) {
                //Remove oldest entry
                this.charger.log.shift();
            }
            //Add new entry
            let dateTime = new Date().toISOString();
            this.charger.log.push(dateTime + ' ' + message + '\n');
        }
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
        }).catch((err) => {
            this.error('Failed to update debug messages', err);
        });
    }

    #sleep(time) {
        return new Promise((resolve) => this.homey.setTimeout(resolve, time));
    }

    #isInt(value) {
        return (
            !isNaN(value) &&
            (function (x) {
                return (x | 0) === x;
            })(parseFloat(value))
        );
    }
}

module.exports = ChargerDevice;
