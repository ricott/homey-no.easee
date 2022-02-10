'use strict';

const Homey = require('homey');
var EaseeCharger = require('../../lib/easee.js');
const enums = require('../../lib/enums.js');
const crypto = require('crypto');
const { debounce } = require('throttle-debounce');
const EaseeStream = require('../../lib/easeeStream.js');
const TokenManager = require('../../lib/tokenManager.js');
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

    async onInit() {
        this.charger = {
            stream: null,
            lastStreamMessageTimestamp: null,
            streamMessages: [],
            log: []
        };

        this.logMessage(`Easee charger initiated, '${this.getName()}'`);

        //App was restarted, Zero out last error field
        this.updateSetting('easee_last_error', '');

        this.pollIntervals = [];
        this.tokenManager = TokenManager;

        this.setupCapabilities();

        //Status seems to bounce, lets debounce it
        //If status is kept for less than 60 seconds, ignore it
        this.updateStatus = debounce(60000, (status) => {
            this.logMessage(`Setting charger status '${status}'`);
            this._updateProperty('charger_status', status);
        });

        this.registerCapabilityListener('button.organize', async () => {
            //Delete all capabilities and then add them in right order
            this.logMessage(`Reorganizing all capabilities to correct order`);
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

                self.updateChargerSiteInfo();
                self.updateChargerStatistics();
                //Setup SignalR stream
                self.startSignalRStream();

                self._initilializeTimers();
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

    startSignalRStream() {
        this.logMessage(`Opening SignalR stream, for charger '${this.getData().id}'`);
        let options = {
            accessToken: this.getToken().accessToken,
            deviceType: enums.deviceTypes().CHARGER,
            deviceId: this.getData().id,
            appVersion: this.driver.getAppVersion()
        };
        this.charger.stream = new EaseeStream(options);
        //Initialize event listeners for the newly created charge stream
        this._initializeEventListeners();
        this.charger.stream.open();
    }

    stopSignalRStream() {
        this.logMessage(`Closing SignalR stream, for charger '${this.getData().id}'`);
        this.charger.stream.close();
    }

    monitorSignalRStream() {
        let self = this;
        //If invalid credentials the lastStreamMessageTimestamp is null
        //if so skip this check
        if (self.charger.lastStreamMessageTimestamp) {
            //Stream disconnected or no message in last 30 minutes
            if ((new Date().getTime() - self.charger.lastStreamMessageTimestamp.getTime()) > (1000 * 1800)) {
                //if ((new Date().getTime() - self.charger.lastStreamMessageTimestamp.getTime()) > (1000 * 60)) {
                //Lets start a new connection, after making sure previous is killed
                self.logMessage(`SignalR stream is idle, for charger '${self.getData().id}'`);

                //Not unlikely we are here due to access token is invalid, lets refresh it
                self.refreshAccessToken(true)
                    .then(() => {
                        self.stopSignalRStream();
                        //Sleep to make sure the old connection is killed properly
                        sleep(5000).then(() => {
                            self.startSignalRStream();
                        });
                    }).catch(reason => {
                        self.logError(reason);
                    });
            }
        }
    }

    removeCapabilityHelper(capability) {
        if (this.hasCapability(capability)) {
            try {
                this.logMessage(`Remove existing capability '${capability}'`);
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
                this.logMessage(`Adding missing capability '${capability}'`);
                this.addCapability(capability);
            } catch (reason) {
                this.error(`Failed to add capability '${capability}'`);
                this.error(reason);
            }
        }
    }

    setupCapabilities() {
        this.logMessage('Setting up capabilities');

        //Add and remove capabilities as part of upgrading a device
        this.removeCapabilityHelper('measure_charge.lifetime');
        this.removeCapabilityHelper('connected');
        this.removeCapabilityHelper('current_used');
        this.removeCapabilityHelper('threePhase');

        this.addCapabilityHelper('enabled');
        this.addCapabilityHelper('button.organize');
        this.addCapabilityHelper('button.reconnect');
        this.addCapabilityHelper('measure_current.p1');
        this.addCapabilityHelper('measure_current.p2');
        this.addCapabilityHelper('measure_current.p3');
        this.addCapabilityHelper('meter_power.lastCharge');
        this.addCapabilityHelper('meter_power');

        let capability = 'measure_charge';
        if (!this.hasCapability(capability) && this.getSetting('showLast30daysStats')) {
            this.addCapabilityHelper(capability);
        } else if (this.hasCapability(capability) && !this.getSetting('showLast30daysStats')) {
            this.removeCapabilityHelper(capability);
        }

        capability = 'measure_charge.last_month';
        if (!this.hasCapability(capability) && this.getSetting('showLastMonthStats')) {
            this.addCapabilityHelper(capability);
        } else if (this.hasCapability(capability) && !this.getSetting('showLastMonthStats')) {
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

    /*
        Different observations to read depending on grid type TN or IT
        For IT grid
        inCurrentT1=PE, inCurrentT2=L1, inCurrentT3=L2, inCurrentT4=L3, inCurrentT5=<not used>
        For TN grid
        inCurrentT1=PE, inCurrentT2=N, inCurrentT3=L1, inCurrentT4=L2, inCurrentT5=L3
    */
    updateCurrentAndVoltage(data) {
        const gridType = this.getSetting('detectedPowerGridType');
        if (gridType === enums.DETECTED_POWER_GRID_TYPE.IT_3_PHASE.key ||
            gridType === enums.DETECTED_POWER_GRID_TYPE.IT_1_PHASE.key) {
            switch (data.observation) {
                case 'inVoltageT2T3':
                    this._updateProperty('measure_voltage', parseInt(data.value));
                    break;
                case 'inCurrentT2':
                    this._updateProperty('measure_current.p1', data.value);
                    break;
                case 'inCurrentT3':
                    this._updateProperty('measure_current.p2', data.value);
                    break;
                case 'inCurrentT4':
                    this._updateProperty('measure_current.p3', data.value);
                    break;
            }
        } else {
            switch (data.observation) {
                case 'InVolt_T2_T3':
                    this._updateProperty('measure_voltage', parseInt(data.value));
                    break;
                case 'InCurrent_T3':
                    this._updateProperty('measure_current.p1', data.value);
                    break;
                case 'InCurrent_T4':
                    this._updateProperty('measure_current.p2', data.value);
                    break;
                case 'InCurrent_T5':
                    this._updateProperty('measure_current.p3', data.value);
                    break;
            }
        }
    }

    _initializeEventListeners() {
        let self = this;
        self.logMessage('Setting up event listeners');
        let dateTime = new Date().toISOString();
        self.charger.stream.on('CommandResponse', data => {
            self.log(`[${self.getName()}] Command response received: `, data);
            self.updateSetting('commandResponse', dateTime + '\n' + JSON.stringify(data, null, "  "));
        });

        self.charger.stream.on('Observation', data => {
            //Keep timestamp from last message received
            self.charger.lastStreamMessageTimestamp = new Date();
            let property = data.observation;
            let value = data.value;

            self.log(`Property: '${property}', Value: '${value}'`);

            switch (data.observation) {
                case 'SoftwareRelease':
                    property = 'version';
                    value = data.value;
                    self.updateSetting(property, value);
                    break;
                case 'PhaseMode':
                    property = 'phaseMode';
                    value = enums.decodePhaseMode(data.value);
                    self.updateSetting(property, value);
                    break;
                case 'LocalNodeType':
                    property = 'nodeType';
                    value = enums.decodeNodeType(data.value);
                    self.updateSetting(property, value);
                    break;
                case 'EnableIdleCurrent':
                    property = 'idleCurrent';
                    value = data.value ? 'Yes' : 'No';
                    self.updateSetting(property, value);
                    break;
                case 'MaxCurrentOfflineFallback_P1':
                    property = 'maxOfflineCurrent';
                    value = data.value;
                    self.updateSetting(property, value);
                    break;
                case 'DetectedPowerGridType':
                    property = 'detectedPowerGridType';
                    value = enums.decodePowerGridType(data.value);
                    self.updateSetting(property, value);
                    break;
                case 'OfflineChargingMode':
                    property = 'offlineChargingMode';
                    value = enums.decodeOfflineChargingModeType(data.value);
                    self.updateSetting(property, value);
                    break;
                case 'LockCablePermanently':
                    property = 'lockCablePermanently';
                    value = data.value ? 'Yes' : 'No';
                    self.updateSetting(property, value);
                    break;
                case 'ChargerOpMode':
                    //Status
                    property = 'charger_status';
                    value = enums.decodeChargerMode(data.value);
                    self.logMessage(`Debouncing charger status '${value}'`);
                    self.updateStatus(value);
                    break;
                case 'TotalPower':
                    //Power
                    property = 'measure_power';
                    value = Math.round(data.value * 1000);
                    self._updateProperty(property, value);
                    break;
                case 'OutputCurrent':
                    //Current allocated
                    property = 'measure_current.offered';
                    value = data.value;
                    self._updateProperty(property, value);
                    break;
                case 'SessionEnergy':
                    //Last charge session kWh
                    property = 'meter_power.lastCharge';
                    value = data.value;
                    self._updateProperty(property, value);
                    break;
                case 'LifetimeEnergy':
                    //Lifetime kWh
                    property = 'meter_power';
                    value = data.value;
                    self._updateProperty(property, value);
                    break;
                case 'IsEnabled':
                    //Enabled
                    property = 'enabled';
                    value = data.value;
                    self._updateProperty(property, value);
                    break;
                case 'SmartCharging':
                    property = 'smartCharging';
                    value = data.value ? 'Yes' : 'No';
                    self.updateSetting(property, value);
                    break;
                case 'ReasonForNoCurrent':
                    property = 'reasonForNoCurrent';
                    value = enums.decodeReasonForNoCurrent(data.value);
                    self.updateSetting(property, value);
                    break;
                default:
                    break;
            }

            self.updateCurrentAndVoltage(data);

            self.logStreamMessage(`'${property}' : '${value}'`);
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
                    self.logMessage('Renewed access token');
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
            appVersion: this.driver.getAppVersion()
        };
        return new EaseeCharger(options);
    }

    //Info not part of streaming API, refreshed once every 30 mins
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

    //Invoked once upon startup of app, considered static information
    updateChargerSiteInfo() {
        let self = this;
        self.logMessage('Getting charger site info');
        self.createEaseeChargerClient().getSiteInfo(self.getData().id)
            .then(function (site) {

                self.setSettings({
                    mainFuse: `${Math.round(site.ratedCurrent)}`,
                    circuitFuse: `${Math.round(site.circuits[0].ratedCurrent)}`,
                    site: JSON.stringify(site, null, "  "),
                    siteId: `${site.circuits[0].siteId}`,
                    circuitId: `${site.circuits[0].id}`
                }).catch(err => {
                    self.error('Failed to update settings', err);
                });

            }).catch(reason => {
                self.logError(reason);
            });
    }

    rebootCharger() {
        let self = this;
        self.logMessage(`Rebooting charger`);
        return self.createEaseeChargerClient().rebootCharger(self.getData().id)
            .then(function (result) {
                return result;
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
                return result;
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
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    startCharging() {
        let self = this;
        self.logMessage(`Starting charge`);
        return self.createEaseeChargerClient().startCharging(self.getData().id)
            .then(function (result) {
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    stopCharging() {
        let self = this;
        self.logMessage(`Stopping charge`);
        return self.createEaseeChargerClient().stopCharging(self.getData().id)
            .then(function (result) {
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    toggleCharging() {
        let self = this;
        self.logMessage(`Toggling charge`);
        return self.createEaseeChargerClient().toggleCharging(self.getData().id)
            .then(function (result) {
                return result;
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
                return result;
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
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    createSchedule(startTime, endTime, repeat) {
        let self = this;
        self.logMessage(`Creating schedule, start '${startTime}', end '${endTime}' and repeat '${repeat}'`);
        return self.createEaseeChargerClient().setBasicChargePlan(self.getData().id,
            startTime, endTime, repeat)
            .then(function (result) {
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    getDynamicCurrent() {
        let self = this;
        return self.createEaseeChargerClient()
            .getDynamicCurrent(self.getSetting('siteId'), self.getSetting('circuitId'))
            .then(function (result) {
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    setDynamicCurrentPerPhase(currentP1, currentP2, currentP3) {
        let self = this;
        self.logMessage(`Setting dynamic charge current to '${currentP1}/${currentP2}/${currentP3}'`);
        return self.createEaseeChargerClient()
            .setDynamicCurrentPerPhase(self.getSetting('siteId'), self.getSetting('circuitId'),
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
        self.logMessage(`Setting charger state to '${state}'`);
        return self.createEaseeChargerClient().setChargerState(self.getData().id, state)
            .then(function (result) {
                return result;
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
                return result;
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
                return result;
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
                return result;
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
                return result;
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
                return result;
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
                return result;
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    _initilializeTimers() {
        this.logMessage('Adding timers');
        //Update last 30 days kWh every 30 mins
        this.pollIntervals.push(setInterval(() => {
            this.updateChargerStatistics();
        }, 60 * 1000 * 30));

        //Refresh access token, each 5 mins from tokenManager
        this.pollIntervals.push(setInterval(() => {
            this.refreshAccessToken(false);
        }, 60 * 1000 * 5));

        //Check that stream is running, if not start new
        this.pollIntervals.push(setInterval(() => {
            this.monitorSignalRStream();
        }, 120 * 1000));

        //Update debug info every minute with last 10 messages
        this.pollIntervals.push(setInterval(() => {
            this.updateDebugMessages();
        }, 60 * 1000));
    }

    _deleteTimers() {
        //Kill interval object(s)
        this.logMessage('Removing timers');
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
                    this.driver.triggerDeviceFlow('charger_status_changed', tokens, this);
                }
            } else {
                this.setCapabilityValue(key, value);
            }
        } else {
            this.logMessage(`Trying to set value for a missing capability: '${key}'`);
        }
    }

    onDeleted() {
        this.log(`Deleting Easee charger '${this.getName()}' from Homey.`);
        this._deleteTimers();
        this.stopSignalRStream();
        this.updateStatus.cancel();

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

    logStreamMessage(message) {
        if (this.charger.streamMessages.length > 9) {
            //Remove oldest entry
            this.charger.streamMessages.shift();
        }
        //Add new entry
        let dateTime = new Date().toISOString();
        this.charger.streamMessages.push(dateTime + '\n' + message + '\n');
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

    getLoggedStreamMessages() {
        return this.charger.streamMessages.toString();
    }

    getLogMessages() {
        return this.charger.log.toString();
    }

    updateDebugMessages() {
        this.setSettings({
            streamMessages: this.getLoggedStreamMessages(),
            log: this.getLogMessages()
        })
            .catch(err => {
                this.error('Failed to update debug messages', err);
            });
    }
}

// sleep time expects milliseconds
function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

module.exports = ChargerDevice;
