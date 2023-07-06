'use strict';

const Homey = require('homey');
const enums = require('../../lib/enums.js');
const crypto = require('crypto');
const Easee = require('../../lib/Easee.js');
const TokenManager = require('../../lib/tokenManager.js');
const algorithm = 'aes-256-cbc';

class EqualizerDevice extends Homey.Device {

    async onInit() {

        this._consumption_since_midnight_changed = this.homey.flow.getDeviceTriggerCard('consumption_since_midnight_changed');
        this._phase_load_changed = this.homey.flow.getDeviceTriggerCard('phase_load_changed');

        this.equalizer = {
            log: [],
            consumptionSinceMidnight: 0
        };

        this.logMessage(`[${this.getName()}] Easee Equalizer initiated`);

        this.tokenManager = TokenManager;

        if (!this.homey.settings.get(`${this.getData().id}.username`)) {
            //This is a newly added device, lets copy login details to homey settings
            this.logMessage(`Storing credentials for user '${this.getStoreValue('username')}'`);
            this.storeCredentialsEncrypted(this.getStoreValue('username'), this.getStoreValue('password'));
        }

        let self = this;
        self.tokenManager.getTokens(self.getUsername(), self.getPassword())
            .then(function (tokens) {
                self.setToken(tokens);

                self.updateEqualizerSiteInfo();
                self.updateEqualizerConfig();
                self.updateEqualizerState();

                self._initilializeTimers();
                self.resetTotalConsumptionAtMidnight();
            }).catch(reason => {
                self.logMessage(reason);
            });
    }

    getToken() {
        return this.getStoreValue('tokens');
    }

    setToken(tokens) {
        this.setStoreValue('tokens', tokens);
    }

    resetTotalConsumptionAtMidnight() {
        let night = new Date();
        night.setDate(night.getDate() + 1)
        night.setHours(0);
        night.setMinutes(0);
        night.setSeconds(1);
        night.setMilliseconds(0);
        let timeToMidnight = night.getTime() - new Date().getTime();

        this.homey.setTimeout(() => {
            this.log(`[${this.getName()}] Resetting total consumption at midnight`);
            this.resetTotalConsumption();
            this.resetTotalConsumptionAtMidnight();
        }, timeToMidnight);
    }

    resetTotalConsumption() {
        this.setStoreValue('totalConsumptionAtMidnight', 0);
    }

    calculateConsumptionSinceMidnight(totalConsumption) {
        //Check if we have totalConsumption from midnight saved
        let totalConsumptionAtMidnight = this.getStoreValue('totalConsumptionAtMidnight') || 0;
        if (totalConsumptionAtMidnight === 0) {
            this.log(`[${this.getName()}] Total consumption store value is '0', setting it to '${totalConsumption}'`);
            this.setStoreValue('totalConsumptionAtMidnight', totalConsumption);
        }

        let consumptionToday = totalConsumption - totalConsumptionAtMidnight;
        //Lets show only 2 decimals
        consumptionToday = parseFloat(consumptionToday.toFixed(2));
        if (this.equalizer.consumptionSinceMidnight != consumptionToday) {
            //Consumption since midnight changed
            this.equalizer.consumptionSinceMidnight = consumptionToday;
            let tokens = {
                consumptionSinceMidnight: consumptionToday
            }
            this._consumption_since_midnight_changed.trigger(this, tokens, {}).catch(error => { this.error(error) });
        }
    }

    createEaseeChargerClient() {
        let options = {
            accessToken: this.getToken().accessToken,
            appVersion: this.homey.app.getAppVersion(),
            device: this
        };
        return new Easee(options, this.homey.app.getStats());
    }

    updateEqualizerConfig() {
        let self = this;
        self.logMessage('Getting equalizer config info');
        self.createEaseeChargerClient().getEqualizerConfig(self.getData().id)
            .then(function (config) {

                self.setSettings({
                    meterid: config.meterId || '',
                    equalizerid: config.equalizerId || '',
                    gridType: enums.decodeGridType(config.gridType)
                }).catch(err => {
                    self.error(`Failed to update config settings`, err);
                });

            }).catch(reason => {
                self.logError(reason);
            });
    }

    updateEqualizerState() {
        let self = this;
        //self.logMessage('Getting equalizer state info');
        self.createEaseeChargerClient().getEqualizerState(self.getData().id)
            .then(function (state) {

                self.setSettings({
                    version: String(state.softwareRelease)
                }).catch(err => {
                    self.error(`Failed to update state settings`, err);
                });

                try {
                    self._updateProperty('measure_power', Math.round(state.activePowerImport * 1000));
                    self._updateProperty('measure_power.surplus', Math.round(state.activePowerExport * 1000));
                    self._updateProperty('meter_power', state.cumulativeActivePowerImport);
                    self._updateProperty('meter_power.surplus', state.cumulativeActivePowerExport);
                    self._updateProperty('measure_current.L1', state.currentL1);
                    self._updateProperty('measure_current.L2', state.currentL2);
                    self._updateProperty('measure_current.L3', state.currentL3);

                    if (self.getSetting('gridType') === enums.GRID_TYPE.IT.key) {
                        self._updateProperty('measure_voltage.L1', parseInt(state.voltageL1L2));
                        self._updateProperty('measure_voltage.L2', parseInt(state.voltageL1L3));
                        self._updateProperty('measure_voltage.L3', parseInt(state.voltageL2L3));
                    } else {
                        self._updateProperty('measure_voltage.L1', parseInt(state.voltageNL1));
                        self._updateProperty('measure_voltage.L2', parseInt(state.voltageNL2));
                        self._updateProperty('measure_voltage.L3', parseInt(state.voltageNL3));
                    }
                } catch (error) {
                    self.logError(error);
                }

            }).catch(reason => {
                self.logError(reason);
            });
    }

    //Invoked once upon startup of app, considered static information
    updateEqualizerSiteInfo() {
        let self = this;
        self.logMessage('Getting equalizer site info');
        self.createEaseeChargerClient().getEqualizerSiteInfo(self.getData().id)
            .then(function (site) {

                self.setSettings({
                    mainFuse: String(Math.round(site.ratedCurrent)),
                    circuitFuse: String(Math.round(site.circuits[0].ratedCurrent))
                }).catch(err => {
                    self.error(`Failed to update site info settings`, err);
                });

            }).catch(reason => {
                self.logError(reason);
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
        this.setSettings({ easee_last_error: dateTime + '\n' + message })
            .catch(err => {
                this.error('Failed to update settings', err);
            });
    }

    isError(err) {
        return (err && err.stack && err.message);
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

    refreshAccessToken() {
        let self = this;
        return self.tokenManager.getTokens(self.getUsername(), self.getPassword())
            .then(function (tokens) {
                if (self.getToken().accessToken != tokens.accessToken) {
                    self.logMessage('Renewed access token');
                }
                self.setToken(tokens);
                return Promise.resolve(true);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    _initilializeTimers() {
        this.logMessage('Adding timers');
        //Refresh state every 15 seconds
        this.homey.setInterval(() => {
            this.updateEqualizerState();
        }, 15 * 1000);

        //Update once per day for the sake of it
        //Fragile to only run once upon startup if the Easee API doesnt respond at that time
        this.homey.setInterval(() => {
            this.updateEqualizerSiteInfo();
            this.updateEqualizerConfig();
        }, 24 * 60 * 60 * 1000);

        //Refresh access token, each 2 mins from tokenManager
        this.homey.setInterval(() => {
            this.refreshAccessToken();
        }, 60 * 1000 * 2);

        //Update debug info every minute with last 10 messages
        this.homey.setInterval(() => {
            this.updateDebugMessages();
        }, 60 * 1000);
    }

    _updateProperty(key, value) {
        if (this.hasCapability(key)) {
            if (typeof value !== 'undefined' && value !== null) {
                let oldValue = this.getCapabilityValue(key);
                if (oldValue !== null && oldValue != value) {
                    this.setCapabilityValue(key, value);

                    if (key === 'measure_current.L1' ||
                        key === 'measure_current.L2' ||
                        key === 'measure_current.L3') {

                        let phase = key.substring(key.indexOf('.') + 1);
                        const mainFuse = Number(this.getSetting('mainFuse'));
                        let utilization = (value / mainFuse) * 100;
                        let tokens = {
                            phase: phase,
                            percentageUtilized: parseFloat(utilization.toFixed(2)),
                            currentUtilized: parseFloat(value.toFixed(2))
                        }
                        this._phase_load_changed.trigger(this, tokens, {}).catch(error => { this.error(error) });
                    } else if (key === 'meter_power') {
                        this.calculateConsumptionSinceMidnight(value);
                    }

                } else {
                    this.setCapabilityValue(key, value);
                }
            } else {
                this.logMessage(`Value for capability '${key}' is 'undefined'`);
            }
        } else {
            this.logMessage(`Trying to set value for a missing capability: '${key}'`);
        }
    }

    onDeleted() {
        this.log(`Deleting Easee equalizer '${this.getName()}' from Homey.`);

        this.homey.settings.unset(`${this.getData().id}.username`);
        this.homey.settings.unset(`${this.getData().id}.password`);
        this.equalizer = null;
    }

    logMessage(message) {
        this.log(`[${this.getName()}] ${message}`);
        if (this.equalizer.log.length > 49) {
            //Remove oldest entry
            this.equalizer.log.shift();
        }
        //Add new entry
        let dateTime = new Date().toISOString();
        this.equalizer.log.push(dateTime + ' ' + message + '\n');
    }

    getLogMessages() {
        return this.equalizer.log.toString();
    }

    updateDebugMessages() {
        this.setSettings({
            log: this.getLogMessages()
        }).catch(err => {
            this.error('Failed to update debug messages', err);
        });
    }
}

module.exports = EqualizerDevice;
