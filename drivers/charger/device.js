'use strict';
const BaseDevice = require('../baseDevice.js');
const Easee = require('../../lib/Easee.js');
const enums = require('../../lib/enums.js');

const deviceClass = 'evcharger';

class ChargerDevice extends BaseDevice {

    #pollIntervals = [];
    #isDeleted = false;

    async onInit() {
        this.logMessage(`Easee charger initialized, '${this.getName()}'`);

        // Change device class to evcharger if not already
        if (this.getClass() !== deviceClass) {
            await this.setClass(deviceClass);
        }

        // Setup capabilities
        await this.setupCapabilities();
        await this.setupCapabilityListeners();

        if (!this.homey.settings.get(`${this.getData().id}.username`)) {
            //This is a newly added device, lets copy login details to homey settings
            await this.storeCredentialsEncrypted(this.getStoreValue('username'), this.getStoreValue('password'));
        }

        await this.refreshAccessToken();

        await this.refreshChargerSettings();
        await this.updateChargerSiteInfo();
        await this.updateChargerStatistics();
        this._initilializeTimers();
    }

    async setupCapabilityListeners() {
        // Homey 12.4.5+: New mandatory EV charger capabilities
        this.registerCapabilityListener('evcharger_charging', async (value) => {
            this.logMessage(`Homey set evcharger_charging: ${value}`);
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
            await this.setDynamicChargerCurrent(current)
                .catch(reason => {
                    let defaultMsg = 'Failed to set dynamic charger current!';
                    return Promise.reject(new Error(this.createFriendlyErrorMsg(reason, defaultMsg)));
                });
        });
    }

    async setupCapabilities(newSettings = null) {
        this.logMessage('Setting up capabilities');

        // Define capability configuration
        const capabilityConfig = {
            // Required capabilities to add
            required: [
                'onoff',
                'target_circuit_current',
                'target_charger_current',
                'enabled',
                'measure_current.p1',
                'measure_current.p2',
                'measure_current.p3',
                'meter_power.lastCharge',
                'meter_power',
                'evcharger_charging',
                'evcharger_charging_state'
            ],

            // Deprecated capabilities to remove
            deprecated: [
                'measure_charge.lifetime',
                'connected',
                'current_used',
                'threePhase',
                'locked',
                'button.reconnect',
                'button.organize'
            ],

            // Conditional capabilities based on settings
            conditional: [
                {
                    capability: 'measure_charge',
                    setting: 'showLast30daysStats'
                },
                {
                    capability: 'measure_charge.last_month',
                    setting: 'showLastMonthStats'
                }
            ],

            // Capability options to update
            options: [
                {
                    capability: 'target_charger_current',
                    options: { max: 40 }
                }
            ]
        };

        try {
            // Process required capabilities in parallel
            const requiredPromises = capabilityConfig.required.map(capability =>
                this.addCapabilityHelper(capability)
            );

            // Process deprecated capabilities in parallel
            const deprecatedPromises = capabilityConfig.deprecated.map(capability =>
                this.removeCapabilityHelper(capability)
            );

            // Process conditional capabilities
            const conditionalPromises = capabilityConfig.conditional.map(async ({ capability, setting }) => {
                const hasCapability = this.hasCapability(capability);
                // Use newSettings if provided (from onSettings), otherwise fall back to getSetting
                const settingEnabled = newSettings ? newSettings[setting] : this.getSetting(setting);
                this.logMessage(`Checking conditional capability: ${capability}, setting: ${setting}, hasCapability: ${hasCapability}, settingEnabled: ${settingEnabled}`);

                if (!hasCapability && settingEnabled) {
                    return this.addCapabilityHelper(capability);
                } else if (hasCapability && !settingEnabled) {
                    return this.removeCapabilityHelper(capability);
                }
                return Promise.resolve();
            });

            // Execute all capability operations in parallel
            await Promise.allSettled([
                ...requiredPromises,
                ...deprecatedPromises,
                ...conditionalPromises
            ]);

            // Update capability options after all capabilities are set up
            const optionPromises = capabilityConfig.options.map(({ capability, options }) =>
                this.updateCapabilityOptions(capability, options)
            );

            await Promise.allSettled(optionPromises);

        } catch (error) {
            this.error('Failed to setup capabilities:', error);
            throw error;
        }
    }

    createEaseeChargerClient() {

        if (!this.getToken()?.accessToken) {
            return Promise.reject(new Error('No access token found'));
        }

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
    async refreshChargerState() {
        try {
            const observations = await this.createEaseeChargerClient().getChargerState(this.getData().id);

            const gridType = this.getSetting('detectedPowerGridType');
            let targetCircuitCurrent = 0;

            observations.forEach(async observation => {
                switch (observation.id) {
                    case 31:
                        await this._updateProperty('enabled', observation.value);
                        break;

                    case 48:
                        await this._updateProperty('target_charger_current', observation.value);
                        break;

                    case 109:
                        const chargerModeStr = enums.decodeChargerMode(observation.value);
                        await this._updateProperty('charger_status', chargerModeStr);

                        const isCharging = enums.decodeChargerMode(observation.value) === enums.decodeChargerMode('Charging');
                        await this._updateProperty('onoff', isCharging);
                        await this._updateProperty('evcharger_charging', isCharging);
                        await this._updateProperty('evcharger_charging_state', enums.decodeEnergyChargerMode(observation.value));
                        break;

                    case 111:
                    case 112:
                    case 113:
                        // Capture circuit current per phase, use the largest value
                        targetCircuitCurrent = Math.max(targetCircuitCurrent, observation.value);
                        break;

                    case 114:
                        await this._updateProperty('measure_current.offered', observation.value);
                        break;

                    case 120:
                        // Convert kW to W
                        await this._updateProperty('measure_power', Math.round(observation.value * 1000));
                        break;

                    case 121:
                        await this._updateProperty('meter_power.lastCharge', observation.value);
                        break;

                    case 124:
                        await this._updateProperty('meter_power', observation.value);
                        break;

                    case 182:
                        // InCurrent_T2
                        if (gridType === enums.DETECTED_POWER_GRID_TYPE.IT_3_PHASE.key ||
                            gridType === enums.DETECTED_POWER_GRID_TYPE.IT_1_PHASE.key) {
                            await this._updateProperty('measure_current.p1', observation.value);
                        }
                        break;

                    case 183:
                        // InCurrent_T3
                        if (gridType === enums.DETECTED_POWER_GRID_TYPE.IT_3_PHASE.key ||
                            gridType === enums.DETECTED_POWER_GRID_TYPE.IT_1_PHASE.key) {
                            await this._updateProperty('measure_current.p2', observation.value);
                        } else {
                            await this._updateProperty('measure_current.p1', observation.value);
                        }
                        break;
                    case 184:
                        // InCurrent_T4
                        if (gridType === enums.DETECTED_POWER_GRID_TYPE.IT_3_PHASE.key ||
                            gridType === enums.DETECTED_POWER_GRID_TYPE.IT_1_PHASE.key) {
                            await this._updateProperty('measure_current.p3', observation.value);
                        } else {
                            await this._updateProperty('measure_current.p2', observation.value);
                        }
                        break;
                    case 185:
                        // InCurrent_T5
                        if (gridType !== enums.DETECTED_POWER_GRID_TYPE.IT_3_PHASE.key &&
                            gridType !== enums.DETECTED_POWER_GRID_TYPE.IT_1_PHASE.key) {
                            await this._updateProperty('measure_current.p3', observation.value);
                        }
                        break;

                    case 194:
                        // InVolt_T2_T3
                        // Parse as int to skip decimals
                        await this._updateProperty('measure_voltage', parseInt(observation.value));
                        break;
                }
            });

            // Use the largest of the three phases
            await this._updateProperty('target_circuit_current', targetCircuitCurrent);

        } catch (error) {
            this.error('Failed to refresh charger state:', error);
        }
    }

    async refreshChargerSettings() {
        try {
            const observations = await this.createEaseeChargerClient().getChargerSettings(this.getData().id);

            const settings = {
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
                        //this.log(`${observation.id}: ${observation.value}`);
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

            try {
                await this.setSettings(settings);
            } catch (error) {
                this.error('Failed to update charger settings:', error);
            }

        } catch (error) {
            this.error('Failed to refresh charger settings:', error);
        }
    }

    async updateChargerStatistics() {
        if (this.getSetting('showLast30daysStats')) {
            this.logMessage('Getting charger statistics, last 30 days');
            try {
                const last30DayskWh = await this.createEaseeChargerClient().getLast30DaysChargekWh(this.getData().id);
                this._updateProperty('measure_charge', last30DayskWh);
            } catch (error) {
                this.error('Failed to get last 30 days statistics:', error);
            }
        }

        if (this.getSetting('showLastMonthStats')) {
            this.logMessage('Getting charger statistics, previous calendar month');
            try {
                const lastMonthkWh = await this.createEaseeChargerClient().getLastMonthChargekWh(this.getData().id);
                this._updateProperty('measure_charge.last_month', lastMonthkWh);
            } catch (error) {
                this.error('Failed to get last month statistics:', error);
            }
        }
    }

    //Invoked upon startup of app, refreshed once per day
    async updateChargerSiteInfo() {
        this.logMessage('Getting charger site info');
        try {
            const client = this.createEaseeChargerClient();
            const chargerId = this.getData().id;

            // Execute both API calls in parallel
            const [siteInfoResult, chargerDetailsResult] = await Promise.allSettled([
                client.getSiteInfo(chargerId),
                client.getChargerDetails(chargerId)
            ]);

            // Handle site info result
            if (siteInfoResult.status === 'fulfilled') {
                try {
                    const site = siteInfoResult.value;
                    const circuitFuse = Math.round(site.circuits[0].ratedCurrent);

                    await this.setSettings({
                        mainFuse: `${Math.round(site.ratedCurrent)}`,
                        circuitFuse: `${circuitFuse}`,
                        siteId: `${site.circuits[0].siteId}`,
                        circuitId: `${site.circuits[0].id}`
                    });
                } catch (error) {
                    this.error('Failed to update site settings:', error);
                }
            } else {
                this.error('Failed to get site info:', siteInfoResult.reason);
            }

            // Handle charger details result
            if (chargerDetailsResult.status === 'fulfilled') {
                try {
                    const details = chargerDetailsResult.value;
                    let partnerName = 'n/a';
                    if (details.partner && details.partner.name) {
                        partnerName = details.partner.name;
                    }

                    await this.setSettings({
                        partner: partnerName
                    });
                } catch (error) {
                    this.error('Failed to update partner setting:', error);
                }
            } else {
                this.error('Failed to get charger details:', chargerDetailsResult.reason);
            }

            // Check if site/circuit IDs were successfully set
            if (this._shouldDeviceBeAvailable()) {
                await this.setDeviceAvailable();
            } else {
                await this.setDeviceUnavailable('Failed to retrieve site id and circuit id from Easee Cloud. Please restart the app to retry.');
            }
        } catch (error) {
            this.error('Failed to update charger site info:', error);
        }
    }

    async rebootCharger() {
        this.logMessage('Rebooting charger');
        try {
            const result = await this.createEaseeChargerClient().rebootCharger(this.getData().id);
            return result;
        } catch (error) {
            this.error('Failed to reboot charger:', error);
            throw error;
        }
    }

    async pauseCharging() {
        this.logMessage('Pausing charge');
        try {
            const result = await this.createEaseeChargerClient().pauseCharging(this.getData().id);
            return result;
        } catch (error) {
            this.error('Failed to pause charging:', error);
            throw error;
        }
    }

    async resumeCharging() {
        this.logMessage('Resuming charge');
        try {
            const result = await this.createEaseeChargerClient().resumeCharging(this.getData().id);
            return result;
        } catch (error) {
            this.error('Failed to resume charging:', error);
            throw error;
        }
    }

    // New start method 2022-10-27
    // first trigger start charge, if fails then try resume
    async startCharging() {
        this.logMessage('Starting charge');
        const client = this.createEaseeChargerClient();
        const chargerId = this.getData().id;

        try {
            const result = await client.startCharging(chargerId);
            return result;
        } catch (startError) {
            this.logMessage('Failed to start charging, trying resume');

            try {
                const result = await client.resumeCharging(chargerId);
                return result;
            } catch (resumeError) {
                this.logMessage('Failed to resume charging, out of luck');
                throw resumeError;
            }
        }
    }

    // New stop method 2022-10-27
    // first trigger stop charge, if fails then try pause
    async stopCharging() {
        this.logMessage('Stopping charge');
        const client = this.createEaseeChargerClient();
        const chargerId = this.getData().id;

        try {
            const result = await client.stopCharging(chargerId);
            return result;
        } catch (stopError) {
            this.logMessage('Failed to stop charging, trying pause');

            try {
                const result = await client.pauseCharging(chargerId);
                return result;
            } catch (pauseError) {
                this.logMessage('Failed to pause charging, out of luck');
                throw pauseError;
            }
        }
    }

    async toggleCharging() {
        this.logMessage('Toggling charge')
        try {
            const result = await this.createEaseeChargerClient().toggleCharging(this.getData().id);
            return result;
        } catch (error) {
            this.error('Failed to toggle charging:', error);
            throw error;
        }
    }

    async overrideSchedule() {
        this.logMessage('Overriding schedule');
        try {
            const result = await this.createEaseeChargerClient().overrideSchedule(this.getData().id);
            return result;
        } catch (error) {
            this.error('Failed to override schedule:', error);
            throw error;
        }
    }

    async deleteSchedule() {
        this.logMessage('Deleting schedule');
        try {
            const result = await this.createEaseeChargerClient().deleteBasicChargePlan(this.getData().id);
            return result;
        } catch (error) {
            this.error('Failed to delete schedule:', error);
            throw error;
        }
    }

    async createSchedule(startTime, endTime, repeat) {
        this.logMessage(`Creating schedule, start '${startTime}', end '${endTime}' and repeat '${repeat}'`);
        try {
            const result = await this.createEaseeChargerClient().setBasicChargePlan(
                this.getData().id,
                startTime,
                endTime,
                repeat,
                this.homey.clock.getTimezone()
            );
            return result;
        } catch (error) {
            this.error('Failed to create schedule:', error);
            throw error;
        }
    }

    async getDynamicCircuitCurrent() {
        try {
            const result = await this.createEaseeChargerClient()
                .getDynamicCircuitCurrent(this.getSetting('siteId'), this.getSetting('circuitId'));
            return result;
        } catch (error) {
            this.error('Failed to get dynamic circuit current:', error);
            throw error;
        }
    }

    async setDynamicCurrentPerPhase(currentP1, currentP2, currentP3) {
        this.logMessage(`Setting dynamic circuit current to '${currentP1}/${currentP2}/${currentP3}'`);
        try {
            const result = await this.createEaseeChargerClient()
                .setDynamicCurrentPerPhase(
                    this.getSetting('siteId'),
                    this.getSetting('circuitId'),
                    currentP1,
                    currentP2,
                    currentP3
                );
            return result;
        } catch (error) {
            this.error('Failed to set dynamic current per phase:', error);
            throw error;
        }
    }

    async setChargingPrice(currency, costPerKWh, taxPerKWh) {
        this.logMessage(`Setting charging price to '${costPerKWh}' ${currency}`);
        try {
            const result = await this.createEaseeChargerClient()
                .setChargingPrice(
                    this.getSetting('siteId'),
                    currency,
                    costPerKWh,
                    taxPerKWh
                );
            return result;
        } catch (error) {
            this.error('Failed to set charging price:', error);
            throw error;
        }
    }

    async setDynamicChargerCurrent(current) {
        this.logMessage(`Setting dynamic charger current to '${current}'`);
        try {
            const result = await this.createEaseeChargerClient().setDynamicChargerCurrent(this.getData().id, current);
            return result;
        } catch (error) {
            this.error('Failed to set dynamic charger current:', error);
            throw error;
        }
    }

    async setMaxChargerCurrent(current) {
        this.logMessage(`Setting charger max current to '${current}'`);
        try {
            const result = await this.createEaseeChargerClient().setMaxChargerCurrent(this.getData().id, current);
            return result;
        } catch (error) {
            this.error('Failed to set max charger current:', error);
            throw error;
        }
    }

    async setChargerState(state) {
        this.logMessage(`Setting charger state to '${state}'`);
        try {
            const result = await this.createEaseeChargerClient().setChargerState(this.getData().id, state);
            return result;
        } catch (error) {
            this.error('Failed to set charger state:', error);
            throw error;
        }
    }

    async pauseSmartCharging() {
        this.logMessage('Pausing smart charging');
        try {
            const result = await this.createEaseeChargerClient().pauseSmartCharging(this.getData().id);
            return result;
        } catch (error) {
            this.error('Failed to pause smart charging:', error);
            throw error;
        }
    }

    async disableSmartCharging() {
        this.logMessage('Disabling smart charging');
        try {
            const result = await this.createEaseeChargerClient().disableSmartCharging(this.getData().id);
            return result;
        } catch (error) {
            this.error('Failed to disable smart charging:', error);
            throw error;
        }
    }

    async enableSmartCharging() {
        this.logMessage('Enabling smart charging');
        try {
            const result = await this.createEaseeChargerClient().enableSmartCharging(this.getData().id);
            return result;
        } catch (error) {
            this.error('Failed to enable smart charging:', error);
            throw error;
        }
    }

    async enableIdleCurrent(state) {
        this.logMessage(`Setting enable idle current to '${state}'`);
        try {
            const result = await this.createEaseeChargerClient().enableIdleCurrent(this.getData().id, state);
            return result;
        } catch (error) {
            this.error('Failed to set idle current:', error);
            throw error;
        }
    }

    async lockCablePermanently(state) {
        this.logMessage(`Setting lock cable permanently to '${state}'`);
        try {
            const result = await this.createEaseeChargerClient().lockCablePermanently(this.getData().id, state);
            return result;
        } catch (error) {
            this.error('Failed to set cable lock:', error);
            throw error;
        }
    }

    async ledStripBrightness(brightness) {
        this.logMessage(`Setting led strip brightness to '${brightness}'`);
        try {
            const result = await this.createEaseeChargerClient().ledStripBrightness(this.getData().id, brightness);
            return result;
        } catch (error) {
            this.error('Failed to set LED strip brightness:', error);
            throw error;
        }
    }

    _initilializeTimers() {
        this.logMessage('Adding timers');
        // Update last 30 days kWh
        this.#pollIntervals.push(this.homey.setInterval(async () => {
            if (this.#isDeleted) return;
            await this.updateChargerStatistics();
        }, 60 * 1000 * 60));

        // Refresh charger settings
        this.#pollIntervals.push(this.homey.setInterval(async () => {
            if (this.#isDeleted) return;
            await this.refreshChargerSettings();
        }, 60 * 1000 * 5));

        // Refresh charger state
        this.#pollIntervals.push(this.homey.setInterval(async () => {
            if (this.#isDeleted) return;
            await this.refreshChargerState();
        }, 30 * 1000));

        // Update once per day for the sake of it
        // Fragile to only run once upon startup if the Easee API doesnt respond at that time
        this.#pollIntervals.push(this.homey.setInterval(async () => {
            if (this.#isDeleted) return;
            await this.updateChargerSiteInfo();
        }, 24 * 60 * 60 * 1000));

        // Refresh access token, each 1 min from tokenManager
        this.#pollIntervals.push(this.homey.setInterval(async () => {
            if (this.#isDeleted) return;
            await this.refreshAccessToken();
        }, 60 * 1000 * 1));
    }

    async _handlePropertyTriggers(key, value) {
        if (key === 'charger_status') {
            let tokens = {
                status: value
            }
            await this.driver.triggerStatusChanged(this, tokens);
        }
    }

    _shouldDeviceBeAvailable() {
        return this.isInt(this.getSetting('siteId')) && this.isInt(this.getSetting('circuitId'));
    }

    onDeleted() {
        this.logMessage('Deleting Easee charger');

        // Set deletion flag first to prevent interval callbacks from executing
        this.#isDeleted = true;

        // Clear all intervals
        this.#pollIntervals.forEach(interval => {
            this.homey.clearInterval(interval);
        });
        this.#pollIntervals = [];

        // Remove credentials
        this.homey.settings.unset(`${this.getData().id}.username`);
        this.homey.settings.unset(`${this.getData().id}.password`);
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        let fieldsChanged = false;

        if (changedKeys.indexOf("showLast30daysStats") > -1) {
            this.logMessage(`showLast30daysStats changed to: ${newSettings.showLast30daysStats}`);
            fieldsChanged = true;
        }
        if (changedKeys.indexOf("showLastMonthStats") > -1) {
            this.logMessage(`showLastMonthStats changed to: ${newSettings.showLastMonthStats}`);
            fieldsChanged = true;
        }

        if (fieldsChanged) {
            await this.setupCapabilities(newSettings);
        }
    }
}
module.exports = ChargerDevice;
