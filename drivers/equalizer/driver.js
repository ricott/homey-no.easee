'use strict';

const Homey = require('homey');
const Easee = require('../../lib/Easee.js');
const TokenManager = require('../../lib/tokenManager.js');

class EqualizerDriver extends Homey.Driver {

    async onInit() {
        this.log(`Easee Home Equalizer driver has been initialized`);
        this.tokenManager = TokenManager;
        this._registerFlows();
    }

    async triggerConsumptionSinceMidnightChanged(device, tokens) {
        await this._consumption_since_midnight_changed.trigger(device, {}, tokens).catch(error => { this.error(error) });
    }

    async triggerPhaseLoadChanged(device, tokens) {
        await this._phase_load_changed.trigger(device, {}, tokens).catch(error => { this.error(error) });
    }

    _registerFlows() {
        this.log('Registering flows');

        this._consumption_since_midnight_changed = this.homey.flow.getDeviceTriggerCard('consumption_since_midnight_changed');
        this._phase_load_changed = this.homey.flow.getDeviceTriggerCard('phase_load_changed');

        //Conditions
        const phaseUtilized = this.homey.flow.getConditionCard('phaseUtilized');
        phaseUtilized.registerRunListener(async (args, state) => {
            this.log(`[${args.device.getName()}] Condition 'phaseUtilized' triggered`);
            this.log(`[${args.device.getName()}] phase: '${args.phase}'`);
            this.log(`[${args.device.getName()}] utilization: ${args.utilization}%`);
            let phaseCurrent = args.device.getCapabilityValue(`measure_current.${args.phase}`);
            this.log(`[${args.device.getName()}] phase current: ${phaseCurrent}A`);
            let utilization = (phaseCurrent / args.device.equalizer.mainFuse) * 100;
            this.log(`[${args.device.getName()}] phase utlization: ${utilization}%`);

            if (utilization >= args.utilization) {
                return true;
            } else {
                return false;
            }
        });

        const anyPhaseUtilized = this.homey.flow.getConditionCard('anyPhaseUtilized');
        anyPhaseUtilized.registerRunListener(async (args, state) => {
            this.log(`[${args.device.getName()}] Condition 'anyPhaseUtilized' triggered`);
            this.log(`[${args.device.getName()}] utilization: ${args.utilization}%`);
            let utilizationL1 = (args.device.getCapabilityValue('measure_current.L1') / args.device.equalizer.mainFuse) * 100;
            let utilizationL2 = (args.device.getCapabilityValue('measure_current.L2') / args.device.equalizer.mainFuse) * 100;
            let utilizationL3 = (args.device.getCapabilityValue('measure_current.L3') / args.device.equalizer.mainFuse) * 100;
            this.log(`[${args.device.getName()}] phase utlization: ${utilizationL1}%, ${utilizationL2}%, ${utilizationL3}%`);

            if (utilizationL1 >= args.utilization || utilizationL2 >= args.utilization || utilizationL3 >= args.utilization) {
                return true;
            } else {
                return false;
            }
        });

        //Actions
        const disableSurplusCharging = this.homey.flow.getActionCard('disableSurplusCharging');
        disableSurplusCharging.registerRunListener(async (args, state) => {
            this.log(`[${args.device.getName()}] Action 'disableSurplusCharging' triggered`);
            try {
                await args.device.createEaseeChargerClient().disableSurplusCharging(args.device.getData().id);
                this.log(`[${args.device.getName()}] Successfully disabled surplus charging`);
                return true;
            } catch (error) {
                this.error(`[${args.device.getName()}] Failed to disable surplus charging:`, error);
                throw new Error(`Failed to disable surplus charging: ${error.message}`);
            }
        });

        const enableSurplusCharging = this.homey.flow.getActionCard('enableSurplusCharging');
        enableSurplusCharging.registerRunListener(async (args, state) => {
            this.log(`[${args.device.getName()}] Action 'enableSurplusCharging' triggered`);
            this.log(`[${args.device.getName()}] maxImportCurrent: ${args.maxImportCurrent}A`);

            // Validate input
            const maxImportCurrent = Number(args.maxImportCurrent);
            if (isNaN(maxImportCurrent) || maxImportCurrent < 0 || maxImportCurrent > 12) {
                this.error(`[${args.device.getName()}] Invalid maxImportCurrent value: ${args.maxImportCurrent}`);
                throw new Error('Maximum import current must be between 0 and 12 amps');
            }

            try {
                await args.device.createEaseeChargerClient().enableSurplusCharging(args.device.getData().id, maxImportCurrent);
                this.log(`[${args.device.getName()}] Successfully enabled surplus charging with ${maxImportCurrent}A max import`);
                return true;
            } catch (error) {
                this.error(`[${args.device.getName()}] Failed to enable surplus charging:`, error);
                throw new Error(`Failed to enable surplus charging: ${error.message}`);
            }
        });
    }

    async onPair(session) {
        const devices = [];

        session.setHandler('login', async (data) => {
            if (data.username === '' || data.password === '') {
                throw new Error('User name and password is mandatory!');
            }

            try {
                const token = await this.tokenManager.getToken(data.username, data.password, this);

                const options = {
                    accessToken: token.accessToken,
                    appVersion: this.homey.app.getAppVersion(),
                    device: this
                };

                const easee = new Easee(options);
                const equalizers = await easee.getEqualizers();

                equalizers.forEach(equalizer => {
                    let name = 'charger.name';
                    if (equalizer.id !== equalizer.name) {
                        name = `${equalizer.name} (${equalizer.id})`;
                    }

                    devices.push({
                        name: name,
                        data: {
                            id: equalizer.id
                        },
                        store: {
                            username: data.username,
                            password: data.password
                        }
                    });
                });

                return true;
            } catch (error) {
                this.error(error);
                throw error;
            }
        });

        session.setHandler('list_devices', async () => {
            return devices;
        });
    }

    async onRepair(session, device) {
        session.setHandler('login', async (data) => {
            if (data.username === '' || data.password === '') {
                throw new Error('User name and password is mandatory!');
            }

            try {
                const token = await this.tokenManager.getToken(data.username, data.password, this, true);

                const options = {
                    accessToken: token.accessToken,
                    appVersion: this.homey.app.getAppVersion(),
                    device: this
                };

                const easee = new Easee(options);
                const equalizers = await easee.getEqualizers();

                const msg = `Equalizer '${device.getName()}' is not connected to the Easee account '${data.username}'`;

                if (!Array.isArray(equalizers)) {
                    // The account doesn't have any linked equalizers
                    this.error(msg);
                    throw new Error(msg);
                }

                // Verify the new account has access to the equalizer being repaired
                const equalizer = equalizers.find(eq => eq.id === device.getData().id);

                if (equalizer) {
                    this.log(`Found equalizer with id '${equalizer.id}'`);
                    await device.storeCredentialsEncrypted(data.username, data.password);
                    return true;
                } else {
                    this.error(msg);
                    throw new Error(msg);
                }
            } catch (error) {
                this.error(error);
                throw error;
            }
        });
    }

    // Used for logging messages from the tokenManager
    logMessage(message) {
        this.log(`[EqualizerDriver] ${message}`);
    }
}

module.exports = EqualizerDriver;
