'use strict';

const Homey = require('homey');
const dateFormat = require("dateformat");
const enums = require('../../lib/enums.js');
const crypto = require('crypto');
var Easee = require('../../lib/easee.js');
const EaseeStream = require('../../lib/easeeStream.js');
const TokenManager = require('../../lib/tokenManager.js');
const algorithm = 'aes-256-cbc';

class EqualizerDevice extends Homey.Device {

    onInit() {
        this.equalizer = {
            id: this.getData().id,
            name: this.getName(),
            mainFuse: this.getSettings().mainFuse,
            tokens: null,
            stream: null,
            lastStreamMessageTimestamp: null,
            streamMessages: [],
            log: []
        };

        this.logMessage(`Easee equalizer initiated, '${this.getName()}'`);

        this.pollIntervals = [];
        this.tokenManager = TokenManager;

        if (!Homey.ManagerSettings.get(`${this.equalizer.id}.username`)) {
            //This is a newly added device, lets copy login details to homey settings
            this.logMessage(`Storing credentials for user '${this.getStoreValue('username')}'`);
            this.storeCredentialsEncrypted(this.getStoreValue('username'), this.getStoreValue('password'));
        }

        let self = this;
        self.tokenManager.getTokens(self.getUsername(), self.getPassword())
            .then(function (tokens) {
                self.equalizer.tokens = tokens;

                self.updateEqualizerSiteInfo();

                //Setup SignalR stream
                self.startSignalRStream();

                self._initilializeTimers();
            }).catch(reason => {
                self.logMessage(reason);
            });
    }

    startSignalRStream() {
        this.logMessage(`Opening SignalR stream, for equalizer '${this.equalizer.id}'`);
        let options = {
            accessToken: this.equalizer.tokens.accessToken,
            deviceType: enums.deviceTypes().EQUALIZER,
            deviceId: this.equalizer.id
        };
        this.equalizer.stream = new EaseeStream(options);
        //Initialize event listeners for the newly created device stream
        this._initializeEventListeners();
        this.equalizer.stream.open();
    }

    stopSignalRStream() {
        this.logMessage(`Closing SignalR stream, for equalizer '${this.equalizer.id}'`);
        this.equalizer.stream.close();
    }

    monitorSignalRStream() {
        let self = this;
        //If invalid credentials the lastStreamMessageTimestamp is null
        //if so skip this check
        if (self.equalizer.lastStreamMessageTimestamp) {
            //Stream disconnected or no message in last 10 minutes        
            if ((new Date().getTime() - self.equalizer.lastStreamMessageTimestamp.getTime()) > (1000 * 600)) {
                //if ((new Date().getTime() - self.equalizer.lastStreamMessageTimestamp.getTime()) > (1000 * 60)) {
                //Lets start a new connection, after making sure previous is killed
                self.logMessage(`SignalR stream is idle, for equalizer '${self.equalizer.id}'`);

                this.stopSignalRStream();
                //Sleep to make sure the old connection is killed properly
                sleep(5000).then(() => {
                    this.startSignalRStream();
                });
            }
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
        self.logMessage('Setting up event listeners');
        self.equalizer.stream.on('CommandResponse', data => {
            self.log(`[${self.getName()}] Command response received: `, data);

            self.setSettings({
                commandResponse: dateFormat(new Date(), 'yyyy-mm-dd HH:MM:ss') + '\n' + JSON.stringify(data, null, "  ")
            }).catch(err => {
                self.error('Failed to update settings', err);
            });
        });

        self.equalizer.stream.on('Observation', data => {
            //Keep timestamp from last message received
            self.equalizer.lastStreamMessageTimestamp = new Date();
            let property = data.observation;
            let value = data.value;

            switch (data.observation) {
                case 'SoftwareRelease':
                    property = 'version';
                    value = data.value;
                    self.updateSetting(property, value);
                    break;
                case 'MeterID':
                    property = 'meterid';
                    value = data.value;
                    self.updateSetting(property, value);
                    break;
                case 'EqualizerID':
                    property = 'equalizerid';
                    value = data.value;
                    self.updateSetting(property, value);
                    break;
                case 'GridType':
                    property = 'detectedPowerGridType';
                    value = enums.decodePowerGridType(data.value);
                    self.updateSetting(property, value);
                    break;
                case 'ActivePowerImport':
                    property = 'measure_power';
                    value = Math.round(data.value * 1000);
                    self._updateProperty(property, value);
                    break;
                case 'ActivePowerExport':
                    property = 'measure_power.surplus';
                    value = Math.round(data.value * 1000);
                    self._updateProperty(property, value);
                    break;
                case 'Current_L1':
                    property = 'measure_current.L1';
                    value = data.value;
                    self._updateProperty(property, value);
                    break;
                case 'Current_L2':
                    property = 'measure_current.L2';
                    value = data.value;
                    self._updateProperty(property, value);
                    break;
                case 'Current_L3':
                    property = 'measure_current.L3';
                    value = data.value;
                    self._updateProperty(property, value);
                    break;
                case 'Voltage_N_L1':
                    property = 'measure_voltage.L1';
                    value = data.value;
                    self._updateProperty(property, value);
                    break;
                case 'Voltage_N_L2':
                    property = 'measure_voltage.L2';
                    value = data.value;
                    self._updateProperty(property, value);
                    break;
                case 'Voltage_N_L3':
                    property = 'measure_voltage.L3';
                    value = data.value;
                    self._updateProperty(property, value);
                    break;
                case 'CumulativeActivePowerImport':
                    property = 'meter_power';
                    value = data.value;
                    self._updateProperty(property, value);
                    break;
                case 'CumulativeActivePowerExport':
                    property = 'meter_power.surplus';
                    value = data.value;
                    self._updateProperty(property, value);
                    break;
                default:
                    break;
            }

            this.logStreamMessage(`'${property}' : '${value}'`);
        });
    }

    //Invoked once upon startup of app, considered static information
    updateEqualizerSiteInfo() {
        let self = this;
        self.logMessage('Getting equalizer site info');
        new Easee(self.equalizer.tokens).getEqualizerSiteInfo(self.equalizer.id)
            .then(function (site) {

                self.equalizer.mainFuse = Math.round(site.ratedCurrent);

                self.setSettings({
                    mainFuse: `${Math.round(site.ratedCurrent)}`,
                    circuitFuse: `${Math.round(site.circuits[0].ratedCurrent)}`,
                    site: JSON.stringify(site, null, "  ")
                }).catch(err => {
                    self.error('Failed to update settings', err);
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

        this.setSettings({ easee_last_error: dateFormat(new Date(), 'yyyy-mm-dd HH:MM:ss') + '\n' + message })
            .catch(err => {
                this.error('Failed to update settings', err);
            });
    }

    isError(err) {
        return (err && err.stack && err.message);
    }

    storeCredentialsEncrypted(plainUser, plainPassword) {
        this.logMessage(`Encrypting credentials for user '${plainUser}'`);
        Homey.ManagerSettings.set(`${this.equalizer.id}.username`, this.encryptText(plainUser));
        Homey.ManagerSettings.set(`${this.equalizer.id}.password`, this.encryptText(plainPassword));

        //Remove unencrypted credentials passed from driver
        this.unsetStoreValue('username');
        this.unsetStoreValue('password');
    }

    getUsername() {
        return this.decryptText(Homey.ManagerSettings.get(`${this.equalizer.id}.username`));
    }

    getPassword() {
        return this.decryptText(Homey.ManagerSettings.get(`${this.equalizer.id}.password`));
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
                if (self.equalizer.tokens.accessToken != tokens.accessToken) {
                    self.logMessage('Renewed access token');
                }
                self.equalizer.tokens = tokens;
                return Promise.resolve(true);
            }).catch(reason => {
                self.logError(reason);
                return Promise.reject(reason);
            });
    }

    _initilializeTimers() {
        this.logMessage('Adding timers');
        //Refresh access token, each 15 mins from tokenManager
        this.pollIntervals.push(setInterval(() => {
            this.refreshAccessToken();
        }, 60 * 1000 * 15));

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

                if (key === 'measure_current.L1' ||
                    key === 'measure_current.L2' ||
                    key === 'measure_current.L3') {

                    let phase = key.substring(key.indexOf('.') + 1);
                    let utilization = (value / this.equalizer.mainFuse) * 100;
                    let tokens = {
                        phase: phase,
                        percentageUtilized: parseFloat(utilization.toFixed(2)),
                        currentUtilized: parseFloat(value.toFixed(2))
                    }
                    this.getDriver().triggerFlow('trigger.phase_load_changed', tokens, this);
                }

            } else {
                this.setCapabilityValue(key, value);
            }
        } else {
            this.logMessage(`Trying to set value for a missing capability: '${key}'`);
        }
    }

    onDeleted() {
        this.log(`Deleting Easee equalizer '${this.getName()}' from Homey.`);
        this._deleteTimers();
        this.stopSignalRStream();

        Homey.ManagerSettings.unset(`${this.equalizer.id}.username`);
        Homey.ManagerSettings.unset(`${this.equalizer.id}.password`);
        this.equalizer = null;
    }

    onRenamed(name) {
        this.logMessage(`Renaming Easee equalizer from '${this.equalizer.name}' to '${name}'`);
        this.equalizer.name = name;
    }

    async onSettings(oldSettings, newSettings, changedKeysArr) {
        let fieldsChanged = false;

        if (fieldsChanged) {
            this.setupCapabilities();
        }
    }

    logStreamMessage(message) {
        if (this.equalizer.streamMessages.length > 9) {
            //Remove oldest entry
            this.equalizer.streamMessages.shift();
        }
        //Add new entry
        this.equalizer.streamMessages.push(dateFormat(new Date(), 'yyyy-mm-dd HH:MM:ss') + '\n' + message + '\n');
    }

    logMessage(message) {
        this.log(`[${this.getName()}] ${message}`);
        if (this.equalizer.log.length > 49) {
            //Remove oldest entry
            this.equalizer.log.shift();
        }
        //Add new entry
        this.equalizer.log.push(dateFormat(new Date(), 'yyyy-mm-dd HH:MM:ss') + ' ' + message + '\n');
    }

    getLoggedStreamMessages() {
        return this.equalizer.streamMessages.toString();
    }

    getLogMessages() {
        return this.equalizer.log.toString();
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

module.exports = EqualizerDevice;
