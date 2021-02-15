'use strict';

const Homey = require('homey');
var EaseeCharger = require('../../lib/easee.js');
var EaseeCharger = require('../../lib/easee.js');
const enums = require('../../lib/enums.js');
const crypto = require('crypto');
const EaseeStream = require('../../lib/easeeStream.js');
const algorithm = 'aes-256-cbc';

const deviceCapabilitesList = ['charger_status',
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
    'measure_charge.last_month'];

class ChargerDevice extends Homey.Device {

    onInit() {
        this.log(`Easee charger initiated, '${this.getName()}'`);

        this.pollIntervals = [];
        this.showLast30daysStats = this.getSettings().showLast30daysStats;
        this.showLastMonthStats = this.getSettings().showLastMonthStats;

        this.setupCapabilities();

        this.registerCapabilityListener('button.organize', async () => {
            //Delete all capabilities and then add them in right order
            this.log(`Reorganizing all capabilities to correct order`);
            this.getCapabilities().forEach(capability => {
                if (capability != 'button.organize') {
                    this.removeCapabilityHelper(capability);
                }
            });

            sleep(2000).then(() => {
                deviceCapabilitesList.forEach(capability => {
                    if (capability != 'measure_charge' && capability != 'measure_charge.last_month') {
                        //All other fields should be added
                        this.addCapabilityHelper(capability);
                    } else if ((capability === 'measure_charge' && this.showLast30daysStats) ||
                        (capability === 'measure_charge.last_month' && this.showLastMonthStats)) {
                        //Add if configured to be shown
                        this.log(`Adding capability based on configuration '${capability}'`);
                        this.addCapabilityHelper(capability);
                    }
                });
            });

            return Promise.resolve(true);
        });

        this.charger = {
            id: this.getData().id,
            name: this.getName(),
            siteId: 0,
            circuitId: 0,
            tokens: null,
            stream: null
        };

        if (!Homey.ManagerSettings.get(`${this.charger.id}.username`)) {
            //This is a newly added device, lets copy login details to homey settings
            this.log(`Storing credentials for user '${this.getStoreValue('username')}'`);
            this.storeCredentialsEncrypted(this.getStoreValue('username'), this.getStoreValue('password'));
        }

        let self = this;
        self.getDriver().getTokens(self.getUsername(), self.getPassword())
            .then(function (tokens) {
                self.charger.tokens = tokens;

                self.updateChargerSiteInfo();
                self.updateChargerStatistics();
                //Setup SignalR stream
                self.startSignalRStream();

                self._initilializeTimers();
                self._initializeEventListeners();
            }).catch(reason => {
                self.log(reason);
            });
    }

    startSignalRStream() {
        let options = {
            accessToken: this.charger.tokens.accessToken,
            chargerId: this.charger.id
        };
        this.charger.stream = new EaseeStream(options);
        this.charger.stream.open();
    }

    stopSignalRStream() {
        this.charger.stream.close();
    }

    removeCapabilityHelper(capability) {
        if (this.hasCapability(capability)) {
            try {
                this.log(`Remove existing capability '${capability}'`);
                this.removeCapability(capability);
            } catch (reason) {
                this.error(`Failed to removed capability '${capability}'`);
                this.error(reason);
            }
        }
    }
    addCapabilityHelper(capability) {
        if (!this.hasCapability(capability)) {
            try {
                this.log(`Adding missing capability '${capability}'`);
                this.addCapability(capability);
            } catch (reason) {
                this.error(`Failed to add capability '${capability}'`);
                this.error(reason);
            }
        }
    }

    setupCapabilities() {
        this.log('Setting up capabilities');

        //Add and remove capabilities as part of upgrading a device
        this.removeCapabilityHelper('measure_charge.lifetime');
        this.removeCapabilityHelper('connected');
        this.removeCapabilityHelper('current_used');
        this.removeCapabilityHelper('threePhase');
        
        this.addCapabilityHelper('enabled');
        this.addCapabilityHelper('button.organize');
        this.addCapabilityHelper('measure_current.p1');
        this.addCapabilityHelper('measure_current.p2');
        this.addCapabilityHelper('measure_current.p3');
        this.addCapabilityHelper('meter_power.lastCharge');
        this.addCapabilityHelper('meter_power');

        let capability = 'measure_charge';
        if (!this.hasCapability(capability) && this.showLast30daysStats) {
            this.addCapabilityHelper(capability);
        } else if (this.hasCapability(capability) && !this.showLast30daysStats) {
            this.removeCapabilityHelper(capability);
        }

        capability = 'measure_charge.last_month';
        if (!this.hasCapability(capability) && this.showLastMonthStats) {
            this.addCapabilityHelper(capability);
        } else if (this.hasCapability(capability) && !this.showLastMonthStats) {
            this.removeCapabilityHelper(capability);
        }
    }

    updateSetting(key, value) {
        let obj = {};
        obj[key] = String(value);
        this.setSettings(obj).catch(err => {
            this.error('Failed to update settings', err);
        });
    }

    _initializeEventListeners() {
        let self = this;
        self.log('Setting up event listeners');
        self.charger.stream.on('CommandResponse', data => {
            this.log('Command response received:', data);

            let dateTime = new Date().toISOString();
            self.setSettings({
                commandResponse: dateTime + '\n' + JSON.stringify(data, null, "  ")
            }).catch(err => {
                self.error('Failed to update settings', err);
            });
        });

        self.charger.stream.on('Observation', data => {
            switch (data.observation) {
                case 'SoftwareRelease':
                    self.updateSetting('version', data.value);
                    break;
                case 'PhaseMode':
                    self.updateSetting('phaseMode', enums.decodePhaseMode(data.value));
                    break;
                case 'LocalNodeType':
                    self.updateSetting('nodeType', enums.decodeNodeType(data.value));
                    break;
                case 'EnableIdleCurrent':
                    self.updateSetting('idleCurrent', data.value ? 'Yes' : 'No');
                    break;
                case 'MaxCurrentOfflineFallback_P1':
                    self.updateSetting('maxOfflineCurrent', data.value);
                    break;
                case 'DetectedPowerGridType':
                    self.updateSetting('detectedPowerGridType', enums.decodePowerGridType(data.value));
                    break;
                case 'OfflineChargingMode':
                    self.updateSetting('offlineChargingMode', enums.decodeOfflineChargingModeType(data.value));
                    break;
                case 'LockCablePermanently':
                    self.updateSetting('lockCablePermanently', data.value ? 'Yes' : 'No');
                    break;
                case 'ChargerOpMode':
                    //Status
                    self._updateProperty('charger_status', enums.decodeChargerMode(data.value));
                    break;
                case 'TotalPower':
                    //Power
                    self._updateProperty('measure_power', Math.round(data.value * 1000));
                    break;
                case 'InVolt_T2_T3':
                    //Voltage
                    self._updateProperty('measure_voltage', Math.round(data.value));
                    break;
                case 'InCurrent_T3':
                    self._updateProperty('measure_current.p1', data.value);
                    break;
                case 'InCurrent_T4':
                    self._updateProperty('measure_current.p2', data.value);
                    break;
                case 'InCurrent_T5':
                    self._updateProperty('measure_current.p3', data.value);
                    break;
                case 'OutputCurrent':
                    //Current allocated
                    self._updateProperty('measure_current.offered', data.value);
                    break;
                case 'SessionEnergy':
                    //Last charge session kWh
                    self._updateProperty('meter_power.lastCharge', data.value);
                    break;
                case 'LifetimeEnergy':
                    //Lifetime kWh
                    self._updateProperty('meter_power', data.value);
                    break;
                case 'IsEnabled':
                    //Enabled
                    self._updateProperty('enabled', data.value);
                    break;
                case 'SmartCharging':
                    self.updateSetting('smartCharging', data.value ? 'Yes' : 'No');
                    break;
                case 'ReasonForNoCurrent':
                    self.updateSetting('reasonForNoCurrent', enums.decodeReasonForNoCurrent(data.value));
                    break;
                default:
                    break;
            }
        });
    }

    logError(error) {
        let message = '';
        if (this.isError(error)) {
            message = error.stack;
        } else {
            try {
                message = JSON.stringify(error, null, "  ");
            } catch (e) {
                this.log('Failed to stringify object', e);
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
        self.getDriver().getTokens(self.getUsername(), self.getPassword())
            .then(function (tokens) {
                self.charger.tokens = tokens;
            }).catch(reason => {
                self.logError(reason);
                self.error(reason);
            });
    }

    //Info not part of streaming API, refreshed once every 30 mins
    updateChargerStatistics() {
        let self = this;
        self.log('Getting charger statistics');
        if (self.hasCapability('measure_charge')) {
            new EaseeCharger(self.charger.tokens).getLast30DaysChargekWh(self.charger.id)
                .then(function (last30DayskWh) {
                    self._updateProperty('measure_charge', last30DayskWh);
                }).catch(reason => {
                    self.logError(reason);
                    self.error(reason);
                });
        }

        if (self.hasCapability('measure_charge.last_month')) {
            new EaseeCharger(self.charger.tokens).getLastMonthChargekWh(self.charger.id)
                .then(function (lastMonthkWh) {
                    self._updateProperty('measure_charge.last_month', lastMonthkWh);
                }).catch(reason => {
                    self.logError(reason);
                    self.error(reason);
                });
        }
    }

    //Invoked once upon startup of app, considered static information
    updateChargerSiteInfo() {
        let self = this;
        self.log('Getting charger site info');
        new EaseeCharger(self.charger.tokens).getSiteInfo(self.charger.id)
            .then(function (site) {

                self.charger.circuitId = site.circuits[0].id;
                self.charger.siteId = site.circuits[0].siteId;

                self.setSettings({
                    mainFuse: `${Math.round(site.ratedCurrent)}`,
                    circuitFuse: `${Math.round(site.circuits[0].ratedCurrent)}`,
                    site: JSON.stringify(site, null, "  ")
                }).catch(err => {
                    self.error('Failed to update settings', err);
                });

            }).catch(reason => {
                self.logError(reason);
                self.error(reason);
            });
    }

    pauseCharging() {
        let self = this;
        return new EaseeCharger(self.charger.tokens).pauseCharging(self.charger.id)
            .then(function (result) {
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    resumeCharging() {
        let self = this;
        return new EaseeCharger(self.charger.tokens).resumeCharging(self.charger.id)
            .then(function (result) {
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    startCharging() {
        let self = this;
        return new EaseeCharger(self.charger.tokens).startCharging(self.charger.id)
            .then(function (result) {
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    stopCharging() {
        let self = this;
        return new EaseeCharger(self.charger.tokens).stopCharging(self.charger.id)
            .then(function (result) {
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    toggleCharging() {
        let self = this;
        return new EaseeCharger(self.charger.tokens).toggleCharging(self.charger.id)
            .then(function (result) {
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    setDynamicCurrentPerPhase(currentP1, currentP2, currentP3) {
        let self = this;
        return new EaseeCharger(self.charger.tokens)
            .setDynamicCurrentPerPhase(self.charger.siteId,
                self.charger.circuitId,
                currentP1, currentP2, currentP3)
            .then(function (result) {
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    setChargerState(state) {
        let self = this;
        return new EaseeCharger(self.charger.tokens).setChargerState(self.charger.id, state)
            .then(function (result) {
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    enableIdleCurrent(state) {
        let self = this;
        return new EaseeCharger(self.charger.tokens).enableIdleCurrent(self.charger.id, state)
            .then(function (result) {
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    lockCablePermanently(state) {
        let self = this;
        return new EaseeCharger(self.charger.tokens).lockCablePermanently(self.charger.id, state)
            .then(function (result) {
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    ledStripBrightness(brightness) {
        let self = this;
        return new EaseeCharger(self.charger.tokens).ledStripBrightness(self.charger.id, brightness)
            .then(function (result) {
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    _initilializeTimers() {
        this.log('Adding timers');
        //Update last 30 days kWh every 30 mins
        this.pollIntervals.push(setInterval(() => {
            this.updateChargerStatistics();
        }, 60 * 1000 * 30));

        //Refresh access token, each 15 mins from connectionManager
        this.pollIntervals.push(setInterval(() => {
            this.refreshAccessToken();
        }, 60 * 1000 * 15));

        //Check that stream is running, if not start new
        this.pollIntervals.push(setInterval(() => {
            if (this.charger.stream.disconnected()) {
                //Lets start a new connection, after making sure previous is killed
                this.log('SignalR stram is disconnected');
                this.stopSignalRStream();
                sleep(2000).then(() => {
                    this.startSignalRStream();
                });
            }
        }, 60 * 1000));
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
        } else {
            this.log(`Trying to set value for a missing capability: '${key}'`);
        }
    }

    onDeleted() {
        this.log(`Deleting Easee charger '${this.getName()}' from Homey.`);
        this._deleteTimers();
        this.stopSignalRStream();

        Homey.ManagerSettings.unset(`${this.charger.id}.username`);
        Homey.ManagerSettings.unset(`${this.charger.id}.password`);
        this.charger = null;
    }

    onRenamed(name) {
        this.log(`Renaming Easee charger from '${this.charger.name}' to '${name}'`);
        this.charger.name = name;
    }

    async onSettings(oldSettings, newSettings, changedKeysArr) {
        let fieldsChanged = false;

        if (changedKeysArr.indexOf("showLast30daysStats") > -1) {
            this.log('showLast30daysStats changed to:', newSettings.showLast30daysStats);
            this.showLast30daysStats = newSettings.showLast30daysStats;
            fieldsChanged = true;
        }
        if (changedKeysArr.indexOf("showLastMonthStats") > -1) {
            this.log('showLastMonthStats changed to:', newSettings.showLastMonthStats);
            this.showLastMonthStats = newSettings.showLastMonthStats;
            fieldsChanged = true;
        }

        if (fieldsChanged) {
            this.setupCapabilities();
        }
    }
}

// sleep time expects milliseconds
function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

module.exports = ChargerDevice;
