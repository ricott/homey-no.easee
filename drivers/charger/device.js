'use strict';

const Homey = require('homey');
const EaseeCharger = require('../../lib/easee.js');
const enums = require('../../lib/enums.js');
const crypto = require('crypto');
const algorithm = 'aes-256-cbc';

class ChargerDevice extends Homey.Device {

    onInit() {
        this.log(`Easee charger initiated, '${this.getName()}'`);

        this.pollIntervals = [];
        this.refresh_status_charger = this.getSettings().refresh_status_charger || 5;
        this.refresh_status_cloud = this.getSettings().refresh_status_cloud || 10;

        this.charger = {
            id: this.getData().id,
            name: this.getName(),
            siteId: 0,
            circuitId: 0
        };

        if (!Homey.ManagerSettings.get(`${this.charger.id}.username`)) {
            //This is a newly added device, lets copy login details to homey settings
            this.log(`Storing credentials for user '${this.getStoreValue('username')}'`);
            this.storeCredentialsEncrypted(this.getStoreValue('username'), this.getStoreValue('password'));
        }

        let self = this;
        self.getDriver().getTokens(self.getUsername(), self.getPassword())
            .then(function (tokens) {
                self.charger.api = new EaseeCharger(tokens);
                self.updateChargerConfig();
                self.updateChargerState();
                self.updateChargerSiteInfo();

                self._initilializeTimers();
                self._initializeEventListeners();
            }).catch(reason => {
                self.log(reason);
            });
    }

    _initializeEventListeners() {
        let self = this;
        self.charger.api.on('easee_api_error', error => {
            self.error('Houston we have a problem', error);

            let message = '';
            if (self.isError(error)) {
                message = error.stack;
            } else {
                try {
                    message = JSON.stringify(error, null, "  ");
                } catch (e) {
                    self.log('Failed to stringify object', e);
                    message = error.toString();
                }
            }

            let dateTime = new Date().toISOString();
            self.setSettings({ easee_last_error: dateTime + '\n' + message })
                .catch(err => {
                    self.error('Failed to update settings', err);
                });
        });
    }

    isError(err) {
        return (err && err.stack && err.message);
    }

    storeCredentialsEncrypted(plainUser, plainPassword) {
        this.log(`Encrypting credentials for user '${plainUser}'`);
        Homey.ManagerSettings.set(`${this.charger.id}.username`, this.encryptText(plainUser));
        Homey.ManagerSettings.set(`${this.charger.id}.password`, this.encryptText(plainPassword));

        //Remove unencrypted credentials passed from driver
        this.unsetStoreValue('username');
        this.unsetStoreValue('password');
    }

    getUsername() {
        return this.decryptText(Homey.ManagerSettings.get(`${this.charger.id}.username`));
    }

    getPassword() {
        return this.decryptText(Homey.ManagerSettings.get(`${this.charger.id}.password`));
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
        self.log('Refreshing access tokens');
        self.getDriver().getTokens(self.getUsername(), self.getPassword())
            .then(function (tokens) {
                self.charger.api.updateTokens(tokens);
            }).catch(reason => {
                self.error(reason);
            });
    }

    updateChargerSiteInfo() {
        let self = this;
        self.log('Getting charger site info');
        self.charger.api.getSiteInfo(self.charger.id)
            .then(function (site) {

                self.charger.circuitId = site.circuits[0].id;
                self.charger.siteId = site.circuits[0].siteId;

                self.setSettings({
                    mainFuse: `${Math.round(site.ratedCurrent)}`,
                    chargerFuse: `${Math.round(site.circuits[0].ratedCurrent)}`,
                    site: JSON.stringify(site, null, "  ")
                }).catch(err => {
                    self.error('Failed to update settings', err);
                });

            }).catch(reason => {
                self.error(reason);
            });
    }

    updateChargerConfig() {
        let self = this;
        self.log('Getting charger config');
        self.charger.api.getChargerConfig(self.charger.id)
            .then(function (config) {
                self.setSettings({
                    phaseMode: enums.decodePhaseMode(config.phaseMode),
                    nodeType: enums.decodeNodeType(config.localNodeType),
                    idleCurrent: config.enableIdleCurrent ? 'Yes' : 'No',
                    config: JSON.stringify(config, null, "  ")
                }).catch(err => {
                    self.error('Failed to update settings', err);
                });

            }).catch(reason => {
                self.error(reason);
            });
    }

    updateChargerState() {
        let self = this;
        self.charger.api.getChargerState(self.charger.id)
            .then(function (state) {
                self._updateProperty('charger_status', enums.decodeChargerMode(state.chargerOpMode));
                self._updateProperty('connected', state.isOnline);
                self._updateProperty('measure_voltage', Math.round(state.voltage));
                self._updateProperty('measure_power', Math.round(state.totalPower * 1000));
                self._updateProperty('measure_current.offered', state.outputCurrent);

                let inCurrentT2 = Math.round((state.inCurrentT2 + Number.EPSILON) * 100) / 100;
                let inCurrentT3 = Math.round((state.inCurrentT3 + Number.EPSILON) * 100) / 100;
                let inCurrentT4 = Math.round((state.inCurrentT4 + Number.EPSILON) * 100) / 100;
                let inCurrentT5 = Math.round((state.inCurrentT5 + Number.EPSILON) * 100) / 100;
                let currentUsed = Math.max(inCurrentT2, inCurrentT3, inCurrentT4, inCurrentT5);
                self._updateProperty('current_used', currentUsed);

                let avg = (inCurrentT2 + inCurrentT3 + inCurrentT4 + inCurrentT5) / 4;
                let arr = new Float32Array([inCurrentT2, inCurrentT3, inCurrentT4, inCurrentT5]);
                let threePhase = (arr.filter(curr => curr > avg).length > 2) ? true : false;
                self._updateProperty('threePhase', threePhase);

                self.setSettings({
                    version: `${state.chargerFirmware} (latest ${state.latestFirmware})`,
                    state: JSON.stringify(state, null, "  ")
                }).catch(err => {
                    self.error('Failed to update settings', err);
                });

            }).catch(reason => {
                self.error(reason);
            });
    }

    refreshChargerObservations() {
        let self = this;
        self.charger.api.refreshChargerObservations(self.charger.id)
            .catch(reason => {
                self.error(reason);
            });
    }

    pauseCharging() {
        return this.charger.api.pauseCharging(this.charger.id)
            .then(function (result) {
                return result;
            }).catch(reason => {
                return Promise.reject(reason);
            });
    }

    resumeCharging() {
        return this.charger.api.resumeCharging(this.charger.id)
            .then(function (result) {
                return result;
            }).catch(reason => {
                return Promise.reject(reason);
            });
    }

    startCharging() {
        return this.charger.api.startCharging(this.charger.id)
            .then(function (result) {
                return result;
            }).catch(reason => {
                return Promise.reject(reason);
            });
    }

    stopCharging() {
        return this.charger.api.stopCharging(this.charger.id)
            .then(function (result) {
                return result;
            }).catch(reason => {
                return Promise.reject(reason);
            });
    }

    toggleCharging() {
        return this.charger.api.toggleCharging(this.charger.id)
            .then(function (result) {
                return result;
            }).catch(reason => {
                return Promise.reject(reason);
            });
    }

    setDynamicCurrent(amp) {
        return this.charger.api.setDynamicCurrent(this.charger.siteId,
            this.charger.circuitId,
            amp)
            .then(function (result) {
                return result;
            }).catch(reason => {
                return Promise.reject(reason);
            });
    }

    setChargerState(state) {
        return this.charger.api.setChargerState(this.charger.id, state)
            .then(function (result) {
                return result;
            }).catch(reason => {
                return Promise.reject(reason);
            });
    }

    _initilializeTimers() {
        this.log('Adding timers');
        // Request charger to push update to cloud
        this.pollIntervals.push(setInterval(() => {
            this.refreshChargerObservations();
        }, 60 * 1000 * this.refresh_status_charger));

        //Get updates from cloud
        this.pollIntervals.push(setInterval(() => {
            this.updateChargerState();
        }, 1000 * this.refresh_status_cloud));

        //Refresh charger config, once per 24 hours
        this.pollIntervals.push(setInterval(() => {
            this.updateChargerConfig();
            this.updateChargerSiteInfo();
        }, 60 * 1000 * 60 * 24));

        //Refresh access token, each 15 mins from connectionManager
        this.pollIntervals.push(setInterval(() => {
            this.refreshAccessToken();
        }, 60 * 1000 * 15));
    }

    _deleteTimers() {
        //Kill interval object(s)
        this.log('Removing timers');
        this.pollIntervals.forEach(timer => {
            clearInterval(timer);
        });
    }

    _reinitializeTimers() {
        this._deleteTimers();
        this._initilializeTimers();
    }

    _updateProperty(key, value) {
        if (this.hasCapability(key)) {
            let oldValue = this.getCapabilityValue(key);
            if (oldValue !== null && oldValue != value) {
                this.setCapabilityValue(key, value);

                if (key === 'charger_status') {
                    let tokens = {
                        status: value
                    }
                    this.getDriver().triggerFlow('trigger.charger_status_changed', tokens, this);
                }
            } else {
                this.setCapabilityValue(key, value);
            }
        }
    }

    onDeleted() {
        this.log(`Deleting Easee charger '${this.getName()}' from Homey.`);
        this._deleteTimers();

        Homey.ManagerSettings.unset(`${this.charger.id}.username`);
        Homey.ManagerSettings.unset(`${this.charger.id}.password`);
        this.charger = null;
    }

    onRenamed(name) {
        this.log(`Renaming Easee charger from '${this.charger.name}' to '${name}'`);
        this.charger.name = name;
    }

    async onSettings(oldSettings, newSettings, changedKeysArr) {
        let change = false;
        if (changedKeysArr.indexOf("refresh_status_charger") > -1) {
            this.log('Refresh charger value was change to:', newSettings.refresh_status_charger);
            this.refresh_status_charger = newSettings.refresh_status_charger;
            change = true;
        }

        if (changedKeysArr.indexOf("refresh_status_cloud") > -1) {
            this.log('Refresh cloud value was change to:', newSettings.refresh_status_cloud);
            this.refresh_status_cloud = newSettings.refresh_status_cloud;
            change = true;
        }

        if (change) {
            this._reinitializeTimers();
        }
    }
}

module.exports = ChargerDevice;
