'use strict';

const Homey = require('homey');
const Easee = require('../../lib/Easee.js');
const TokenManager = require('../../lib/tokenManager.js');
const enums = require('../../lib/enums.js');
const conditionHandler = require('../../lib/conditionHandler.js');

class ChargerDriver extends Homey.Driver {

    async onInit() {
        this.log(`Easee Home Charger driver has been initialized`);
        this.tokenManager = TokenManager;

        // Register device triggers
        // These triggers are triggered automatically by homey when capability value changes
        this.homey.flow.getDeviceTriggerCard('target_charger_current_changed');
        this.homey.flow.getDeviceTriggerCard('onoff_true');
        this.homey.flow.getDeviceTriggerCard('onoff_false');
        // These two are manually triggered
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

        this._registerFlows();
    }

    triggerStatusChanged(device, tokens) {
        // Old trigger uses token
        this._charger_status_changed.trigger(device, tokens, {}).catch(error => { this.error(error) });
        // New trigger uses state
        this._charger_status_changedv2.trigger(device, {}, tokens).catch(error => { this.error(error) });
    }

    _registerFlows() {
        this.log('Registering flows');
        //Conditions
        const readyToCharge = this.homey.flow.getConditionCard('readyToCharge');
        readyToCharge.registerRunListener(async (args, state) => {
            this.log(`[${args.device.getName()}] Condition 'readyToCharge' triggered`);
            const status = args.device.getCapabilityValue('charger_status');
            this.log(`[${args.device.getName()}] - current status: '${status}'`);

            if (status == enums.decodeChargerMode('Paused') ||
                status == enums.decodeChargerMode('Car connected') ||
                status == enums.decodeChargerMode('Awaiting Authentication')) {
                this.log(`[${args.device.getName()}] - ready to start charging`);
                return true;
            } else {
                this.log(`[${args.device.getName()}] - not ready to start charging`);
                return false;
            }
        });

        const chargerOnOff = this.homey.flow.getConditionCard('on');
        chargerOnOff.registerRunListener(async (args, state) => {
            return args.device.getCapabilityValue('onoff');
        });

        const chargerStatus = this.homey.flow.getConditionCard('chargerStatus');
        chargerStatus.registerRunListener(async (args, state) => {
            this.log(`[${args.device.getName()}] Condition 'chargerStatus' triggered`);
            const status = args.device.getCapabilityValue('charger_status');
            this.log(`[${args.device.getName()}] - current status: '${status}', condition status: '${args.status.name}'`);

            if (status == args.status.name) {
                return true;
            } else {
                return false;
            }
        });
        chargerStatus.registerArgumentAutocompleteListener('status',
            async (query, args) => {
                return enums.getChargerMode();
            }
        );

        const target_charger_current_condition = this.homey.flow.getConditionCard('target_charger_current_condition');
        target_charger_current_condition.registerRunListener(async (args, state) => {
            //this.log(`[${args.device.getName()}] Condition 'target_charger_current_condition' triggered`);
            const current = args.device.getCapabilityValue('target_charger_current');

            return conditionHandler.evaluateNumericCondition(args.conditionType.id, args.current, current);
        });
        target_charger_current_condition.registerArgumentAutocompleteListener('conditionType',
            async (query, args) => {
                return conditionHandler.getNumberConditions();
            }
        );

        //Actions
        const turnOn = this.homey.flow.getActionCard('on');
        turnOn.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'on' triggered`);
            try {
                await args.device.startCharging();
                return true;
            } catch (reason) {
                throw new Error(`Failed to turn on the charger. Reason: ${reason.message}`);
            }
        });

        const turnOff = this.homey.flow.getActionCard('off');
        turnOff.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'off' triggered`);
            try {
                await args.device.stopCharging();
                return true;
            } catch (reason) {
                throw new Error(`Failed to turn off the charger. Reason: ${reason.message}`);
            }
        });

        const toggle = this.homey.flow.getActionCard('toggle');
        toggle.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'toggle' triggered`);
            try {
                await args.device.toggleCharging();
                return true;
            } catch (reason) {
                throw new Error(`Failed to toggle the charger. Reason: ${reason.message}`);
            }
        });

        const rebootCharger = this.homey.flow.getActionCard('rebootCharger');
        rebootCharger.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'rebootCharger' triggered`);
            try {
                await args.device.rebootCharger();
                return true;
            } catch (reason) {
                throw new Error(`Failed to reboot the charger. Reason: ${reason.message}`);
            }
        });

        const disableSmartCharging = this.homey.flow.getActionCard('disableSmartCharging');
        disableSmartCharging.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'disableSmartCharging' triggered`);
            try {
                await args.device.disableSmartCharging();
                return true;
            } catch (reason) {
                throw new Error(`Failed to disable smart charging. Reason: ${reason.message}`);
            }
        });

        const pauseSmartCharging = this.homey.flow.getActionCard('pauseSmartCharging');
        pauseSmartCharging.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'pauseSmartCharging' triggered`);
            try {
                await args.device.pauseSmartCharging();
                return true;
            } catch (reason) {
                throw new Error(`Failed to pause smart charging. Reason: ${reason.message}`);
            }
        });

        const enableSmartCharging = this.homey.flow.getActionCard('enableSmartCharging');
        enableSmartCharging.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'enableSmartCharging' triggered`);
            try {
                await args.device.enableSmartCharging();
                return true;
            } catch (reason) {
                throw new Error(`Failed to enable smart charging. Reason: ${reason.message}`);
            }
        });

        const overrideSchedule = this.homey.flow.getActionCard('overrideSchedule');
        overrideSchedule.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'overrideSchedule' triggered`);
            try {
                await args.device.overrideSchedule();
                return true;
            } catch (reason) {
                throw new Error(`Failed to override schedule. Reason: ${reason.message}`);
            }
        });

        const deleteSchedule = this.homey.flow.getActionCard('deleteSchedule');
        deleteSchedule.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'deleteSchedule' triggered`);
            try {
                await args.device.deleteSchedule();
                return true;
            } catch (reason) {
                throw new Error(`Failed to delete schedule. Reason: ${reason.message}`);
            }
        });

        const createSchedule = this.homey.flow.getActionCard('createSchedule');
        createSchedule.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'createSchedule' triggered`);
            this.log(`[${args.device.getName()}] - startTime: '${args.startTime}'`);
            this.log(`[${args.device.getName()}] - endTime: '${args.endTime}'`);
            this.log(`[${args.device.getName()}] - repeat: '${args.repeat}'`);

            try {
                await args.device.createSchedule(args.startTime, args.endTime, args.repeat);
                return true;
            } catch (reason) {
                throw new Error(`Failed to create schedule. Reason: ${reason.message}`);
            }
        });

        // Register flow card for pausing charging
        const pauseCharging = this.homey.flow.getActionCard('pauseCharging');
        pauseCharging.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'pauseCharging' triggered`);
            try {
                await args.device.pauseCharging();
                return true;
            } catch (reason) {
                throw new Error(`Failed to pause charging. Reason: ${reason.message}`);
            }
        });

        // Register flow card for resuming charging
        const resumeCharging = this.homey.flow.getActionCard('resumeCharging');
        resumeCharging.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'resumeCharging' triggered`);
            try {
                await args.device.resumeCharging();
                return true;
            } catch (reason) {
                throw new Error(`Failed to resume charging. Reason: ${reason.message}`);
            }
        });

        const circuitCurrentControlPerPhase = this.homey.flow.getActionCard('circuitCurrentControlPerPhase');
        circuitCurrentControlPerPhase.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'circuitCurrentControlPerPhase' triggered`);
            this.log(`[${args.device.getName()}] - current: '${args.current1}/${args.current2}/${args.current3}' amps`);
            //Don't set charge current to higher than max value
            let current1 = Math.min(args.current1, args.device.getSettings().circuitFuse);
            let current2 = Math.min(args.current2, args.device.getSettings().circuitFuse);
            let current3 = Math.min(args.current3, args.device.getSettings().circuitFuse);
            this.log(`[${args.device.getName()}] - actual used: '${current1}/${current2}/${current3}' Amps`);

            try {
                await args.device.setDynamicCurrentPerPhase(current1, current2, current3);
                return true;
            } catch (reason) {
                this.log(reason);
                throw new Error(`Failed to set dynamic Circuit current. Reason: ${reason.message}`);
            }
        });

        const circuitCurrentControl = this.homey.flow.getActionCard('circuitCurrentControl');
        circuitCurrentControl.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'circuitCurrentControl' triggered`);
            this.log(`[${args.device.getName()}] - current: '${args.current}' amps`);
            //Don't set charge current to higher than max value
            let current = Math.min(args.current, args.device.getSettings().circuitFuse);
            this.log(`[${args.device.getName()}] - actual used: '${current}' Amps`);

            try {
                await args.device.setDynamicCurrentPerPhase(current, current, current);
                return true;
            } catch (reason) {
                throw new Error(`Failed to set dynamic Circuit current. Reason: ${reason.message}`);
            }
        });

        const chargerState = this.homey.flow.getActionCard('chargerState');
        chargerState.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'chargerState' triggered`);
            this.log(`[${args.device.getName()}] - state: '${args.chargerState}'`);

            let errMsg = `Failed to change state to '${args.chargerState}'`;
            let chargerState = (args.chargerState === 'true') ? true : false;
            try {
                await args.device.setChargerState(chargerState);
                return true;
            } catch (reason) {
                throw new Error(`${errMsg} Reason: ${reason.message}`);
            }
        });

        const enableIdleCurrent = this.homey.flow.getActionCard('enableIdleCurrent');
        enableIdleCurrent.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'enableIdleCurrent' triggered`);
            this.log(`[${args.device.getName()}] - state: '${args.idleCurrent}'`);

            let errMsg = `Failed to change idle current to '${args.idleCurrent}'`;
            let idleCurrent = (args.idleCurrent === 'true') ? true : false;
            try {
                await args.device.enableIdleCurrent(idleCurrent);
                return true;
            } catch (reason) {
                throw new Error(`${errMsg} Reason: ${reason.message}`);
            }
        });

        const lockCablePermanently = this.homey.flow.getActionCard('lockCablePermanently');
        lockCablePermanently.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'lockCablePermanently' triggered`);
            this.log(`[${args.device.getName()}] - state: '${args.lockCable}'`);

            let errMsg = `Failed to change lock cable permanently to '${args.lockCable}'`;
            let lockCable = (args.lockCable === 'true') ? true : false;
            try {
                await args.device.lockCablePermanently(lockCable);
                return true;
            } catch (reason) {
                throw new Error(`${errMsg} Reason: ${reason.message}`);
            }
        });

        const ledStripBrightness = this.homey.flow.getActionCard('ledStripBrightness');
        ledStripBrightness.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'ledStripBrightness' triggered`);
            this.log(`[${args.device.getName()}] - brightness: '${args.ledBrightness}'`);

            let errMsg = `Failed to change brightness to '${args.ledBrightness}'`;
            try {
                await args.device.ledStripBrightness(args.ledBrightness);
                return true;
            } catch (reason) {
                throw new Error(`${errMsg} Reason: ${reason.message}`);
            }
        });

        const decreaseCircuitCurrent = this.homey.flow.getActionCard('decreaseCircuitCurrent');
        decreaseCircuitCurrent.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'decreaseCircuitCurrent' triggered`);
            //Lets fetch the current dynamic current via API, to make sure we are adjusting the real current
            try {
                const dynamicCurrent = await args.device.getDynamicCircuitCurrent();
                this.log(`[${args.device.getName()}] - dynamic current: '${dynamicCurrent.phase1}/${dynamicCurrent.phase2}/${dynamicCurrent.phase3}'`);
                //A user can have locked current to a single phase for one phase charging, lets skip adjusting phases with 0 current
                if (dynamicCurrent.phase1 > 0) {
                    dynamicCurrent.phase1 = Math.min(dynamicCurrent.phase1 -= 1, args.device.getSettings().circuitFuse);
                }
                if (dynamicCurrent.phase2 > 0) {
                    dynamicCurrent.phase2 = Math.min(dynamicCurrent.phase2 -= 1, args.device.getSettings().circuitFuse);
                }
                if (dynamicCurrent.phase3 > 0) {
                    dynamicCurrent.phase3 = Math.min(dynamicCurrent.phase3 -= 1, args.device.getSettings().circuitFuse);
                }
                this.log(`[${args.device.getName()}] - setting dynamic current: '${dynamicCurrent.phase1}/${dynamicCurrent.phase2}/${dynamicCurrent.phase3}'`);

                await args.device.setDynamicCurrentPerPhase(
                    dynamicCurrent.phase1, dynamicCurrent.phase2, dynamicCurrent.phase3);
                return true;
            } catch (reason) {
                throw new Error(`Failed to decrease dynamic circuit current. Reason: ${reason.message}`);
            }
        });

        const increaseCircuitCurrent = this.homey.flow.getActionCard('increaseCircuitCurrent');
        increaseCircuitCurrent.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'increaseCircuitCurrent' triggered`);
            //Lets fetch the current dynamic current via API, to make sure we are adjusting the real current
            try {
                const dynamicCurrent = await args.device.getDynamicCircuitCurrent();
                this.log(`[${args.device.getName()}] - dynamic current: '${dynamicCurrent.phase1}/${dynamicCurrent.phase2}/${dynamicCurrent.phase3}'`);
                //A user can have locked current to a single phase for one phase charging, lets skip adjusting phases with 0 current
                //Don't set current larger than installed fuse size
                if (dynamicCurrent.phase1 > 0) {
                    dynamicCurrent.phase1 = Math.min(dynamicCurrent.phase1 += 1, args.device.getSettings().circuitFuse);
                }
                if (dynamicCurrent.phase2 > 0) {
                    dynamicCurrent.phase2 = Math.min(dynamicCurrent.phase2 += 1, args.device.getSettings().circuitFuse);
                }
                if (dynamicCurrent.phase3 > 0) {
                    dynamicCurrent.phase3 = Math.min(dynamicCurrent.phase3 += 1, args.device.getSettings().circuitFuse);
                }
                this.log(`[${args.device.getName()}] - setting dynamic current: '${dynamicCurrent.phase1}/${dynamicCurrent.phase2}/${dynamicCurrent.phase3}'`);

                await args.device.setDynamicCurrentPerPhase(
                    dynamicCurrent.phase1, dynamicCurrent.phase2, dynamicCurrent.phase3);
                return true;
            } catch (reason) {
                throw new Error(`Failed to increase dynamic circuit current. Reason: ${reason.message}`);
            }
        });

        const setChargingPrice = this.homey.flow.getActionCard('setChargingPrice');
        setChargingPrice.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'setChargingPrice' triggered`);
            this.log(`[${args.device.getName()}] - currency: '${args.currency}'`);
            this.log(`[${args.device.getName()}] - costPerKWh: '${args.costPerKWh}'`);
            this.log(`[${args.device.getName()}] - taxPerKWh: '${args.taxPerKWh}'`);

            try {
                await args.device.setChargingPrice(args.currency, args.costPerKWh, args.taxPerKWh);
                return true;
            } catch (reason) {
                throw new Error(`Failed to set charging price. Reason: ${reason.message}`);
            }
        });

        const setMaxChargerCurrent = this.homey.flow.getActionCard('setMaxChargerCurrent');
        setMaxChargerCurrent.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'setMaxChargerCurrent' triggered`);
            this.log(`[${args.device.getName()}] - current: '${args.current}'`);

            try {
                await args.device.setMaxChargerCurrent(args.current);
                return true;
            } catch (reason) {
                throw new Error(`Failed to set max charging current. Reason: ${reason.message}`);
            }
        });

        const setDynamicChargerCurrent = this.homey.flow.getActionCard('setDynamicChargerCurrent');
        setDynamicChargerCurrent.registerRunListener(async (args) => {
            this.log(`[${args.device.getName()}] Action 'setDynamicChargerCurrent' triggered`);
            this.log(`[${args.device.getName()}] - current: '${args.current}'`);

            try {
                await args.device.setDynamicChargerCurrent(args.current);
                return true;
            } catch (reason) {
                throw new Error(`Failed to set charger dynamic current. Reason: ${reason.message}`);
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
                const chargers = await easee.getChargers();
                
                chargers.forEach(charger => {
                    let name = 'charger.name';
                    if (charger.id !== charger.name) {
                        name = `${charger.name} (${charger.id})`;
                    }

                    devices.push({
                        name: name,
                        data: {
                            id: charger.id
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
                const chargers = await easee.getChargers();
                
                const msg = `Charger '${device.getName()}' is not connected to the Easee account '${data.username}'`;
                
                if (!Array.isArray(chargers)) {
                    // The account doesn't have any linked chargers
                    this.error(msg);
                    throw new Error(msg);
                }

                // Verify the new account has access to the charger being repaired
                const charger = chargers.find(ch => ch.id === device.getData().id);
                
                if (charger) {
                    this.log(`Found charger with id '${charger.id}'`);
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
        this.log(`[ChargerDriver] ${message}`);
    }
}

module.exports = ChargerDriver;
