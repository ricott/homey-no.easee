'use strict';

const Homey = require('homey');
const enums = require('../../lib/enums.js');
const Easee = require('../../lib/Easee.js');
const BaseDevice = require('../baseDevice.js');

const deviceClass = 'other';

class EqualizerDevice extends BaseDevice {

    #pollIntervals = [];

    async onInit() {
        this.logMessage('Easee Equalizer initiated');
        this.consumptionSinceMidnight = 0;

        await this.upgradeDevice();

        if (!this.homey.settings.get(`${this.getData().id}.username`)) {
            //This is a newly added device, lets copy login details to homey settings
            await this.storeCredentialsEncrypted(this.getStoreValue('username'), this.getStoreValue('password'));
        }

        await this.refreshAccessToken();

        this.updateEqualizerSiteInfo();
        this.updateEqualizerConfig();
        this.updateEqualizerState();

        this._initilializeTimers();
        this.resetTotalConsumptionAtMidnight();
    }

    async upgradeDevice() {
        this.log('Upgrading existing device');

        // Change device class to other if not already
        if (this.getClass() !== deviceClass) {
            await this.setClass(deviceClass);
        }

        await this.removeCapabilityHelper('measure_power.surplus');
    }

    resetTotalConsumptionAtMidnight() {
        let night = new Date();
        night.setDate(night.getDate() + 1)
        night.setHours(0);
        night.setMinutes(0);
        night.setSeconds(1);
        night.setMilliseconds(0);
        let timeToMidnight = night.getTime() - new Date().getTime();

        this.homey.setTimeout(async () => {
            this.log(`[${this.getName()}] Resetting total consumption at midnight`);
            await this.resetTotalConsumption();
            this.resetTotalConsumptionAtMidnight();
        }, timeToMidnight);
    }

    async resetTotalConsumption() {
        await this.updateStoreValue('totalConsumptionAtMidnight', 0);
    }

    async calculateConsumptionSinceMidnight(totalConsumption) {
        //Check if we have totalConsumption from midnight saved
        let totalConsumptionAtMidnight = this.getStoreValue('totalConsumptionAtMidnight') || 0;
        if (totalConsumptionAtMidnight === 0) {
            this.log(`[${this.getName()}] Total consumption store value is '0', setting it to '${totalConsumption}'`);
            await this.updateStoreValue('totalConsumptionAtMidnight', totalConsumption);
        }

        let consumptionToday = totalConsumption - totalConsumptionAtMidnight;
        //Lets show only 2 decimals
        consumptionToday = parseFloat(consumptionToday.toFixed(2));
        if (this.consumptionSinceMidnight != consumptionToday) {
            //Consumption since midnight changed
            this.consumptionSinceMidnight = consumptionToday;
            let tokens = {
                consumptionSinceMidnight: consumptionToday
            }
            await this.driver.triggerConsumptionSinceMidnightChanged(this, tokens);
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

    async updateEqualizerConfig() {
        this.logMessage('Getting equalizer config info');

        try {
            const config = await this.createEaseeChargerClient().getEqualizerConfig(this.getData().id);

            await this.setSettings({
                meterid: config.meterId || '',
                equalizerid: config.equalizerId || '',
                gridType: enums.decodeGridType(config.gridType)
            });
        } catch (error) {
            this.error('Failed to update equalizer config:', error);
        }
    }

    async updateEqualizerState() {
        try {
            const state = await this.createEaseeChargerClient().getEqualizerState(this.getData().id);

            await this.updateSetting('version', state.softwareRelease);

            await Promise.all([
                this._updateProperty('measure_power', Math.round(state.activePowerImport * 1000) - Math.round(state.activePowerExport * 1000)),
                this._updateProperty('meter_power', state.cumulativeActivePowerImport),
                this._updateProperty('meter_power.surplus', state.cumulativeActivePowerExport),
                this._updateProperty('measure_current.L1', state.currentL1),
                this._updateProperty('measure_current.L2', state.currentL2),
                this._updateProperty('measure_current.L3', state.currentL3)
            ]);

            if (this.getSetting('gridType') === enums.GRID_TYPE.IT.key) {
                await Promise.all([
                    this._updateProperty('measure_voltage.L1', parseInt(state.voltageL1L2)),
                    this._updateProperty('measure_voltage.L2', parseInt(state.voltageL1L3)),
                    this._updateProperty('measure_voltage.L3', parseInt(state.voltageL2L3))
                ]);
            } else {
                await Promise.all([
                    this._updateProperty('measure_voltage.L1', parseInt(state.voltageNL1)),
                    this._updateProperty('measure_voltage.L2', parseInt(state.voltageNL2)),
                    this._updateProperty('measure_voltage.L3', parseInt(state.voltageNL3))
                ]);
            }
        } catch (error) {
            this.error('Failed to update equalizer state:', error);
        }
    }

    //Invoked once upon startup of app, considered static information
    async updateEqualizerSiteInfo() {
        this.logMessage('Getting equalizer site info');

        try {
            const site = await this.createEaseeChargerClient().getEqualizerSiteInfo(this.getData().id);

            await this.setSettings({
                mainFuse: String(Math.round(site.ratedCurrent)),
                circuitFuse: String(Math.round(site.circuits[0].ratedCurrent))
            });
        } catch (error) {
            this.error('Failed to update equalizer site info:', error);
        }
    }

    _initilializeTimers() {
        this.logMessage('Adding timers');
        //Refresh state every 15 seconds
        this.#pollIntervals.push(this.homey.setInterval(async () => {
            await this.updateEqualizerState();
        }, 15 * 1000));

        //Update once per day for the sake of it
        //Fragile to only run once upon startup if the Easee API doesnt respond at that time
        this.#pollIntervals.push(this.homey.setInterval(async () => {
            await this.updateEqualizerSiteInfo();
            await this.updateEqualizerConfig();
        }, 24 * 60 * 60 * 1000));

        //Refresh access token, each 1 mins from tokenManager
        this.#pollIntervals.push(this.homey.setInterval(async () => {
            await this.refreshAccessToken();
        }, 60 * 1000 * 1));
    }

    async _handlePropertyTriggers(key, value) {
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
            await this.driver.triggerPhaseLoadChanged(this, tokens);
        } else if (key === 'meter_power') {
            this.calculateConsumptionSinceMidnight(value);
        }
    }

    onDeleted() {
        this.logMessage('Deleting equalizer');
        this.homey.settings.unset(`${this.getData().id}.username`);
        this.homey.settings.unset(`${this.getData().id}.password`);

        this.#pollIntervals.forEach(interval => {
            this.homey.clearInterval(interval);
        });
    }
}
module.exports = EqualizerDevice;
