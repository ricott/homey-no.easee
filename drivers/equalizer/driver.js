'use strict';

const Homey = require('homey');
const Easee = require('../../lib/Easee.js');
const TokenManager = require('../../lib/tokenManager.js');

class EqualizerDriver extends Homey.Driver {

    async onInit() {
        this.log(`[Easee Home Equalizer driver has been initialized`);
        this.tokenManager = TokenManager;
    }

    _registerFlows() {
        this.log('Registering flows');

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
    }

    async onPair(session) {
        let devices = [];
        let self = this;

        session.setHandler('login', async (data) => {
            if (data.username == '' || data.password == '') {
                throw new Error('User name and password is mandatory!');
            }

            return self.tokenManager.getToken(data.username, data.password)
                .then(function (token) {
                    let options = {
                        accessToken: token.accessToken,
                        appVersion: self.homey.app.getAppVersion(),
                        device: self
                    };
                    let easee = new Easee(options);
                    return easee.getEqualizers().then(function (equalizers) {
                        equalizers.forEach(equalizer => {
                            let name = 'charger.name';
                            if (equalizer.id != equalizer.name) {
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

                    }).catch(reason => {
                        self.error(reason);
                        throw reason;
                    });
                }).catch(reason => {
                    self.error(reason);
                    throw reason;
                });
        });

        session.setHandler('list_devices', async (data) => {
            return devices;
        });
    }

    onRepair(session, device) {
        let self = this;

        session.setHandler('login', async (data) => {
            if (data.username == '' || data.password == '') {
                throw new Error('User name and password is mandatory!');
            }

            return self.tokenManager.getToken(data.username, data.password, true)
                .then(function (token) {
                    let options = {
                        accessToken: token.accessToken,
                        appVersion: self.homey.app.getAppVersion(),
                        device: self
                    };
                    const easee = new Easee(options);
                    return easee.getEqualizers()
                        .then(function (equalizers) {
                            const msg = `Equalizer '${device.getName()}' is not connected to the Easee account '${data.username}'`;
                            if (!Array.isArray(equalizers)) {
                                // The account doesnt have any linked equalizers
                                self.error(msg);
                                throw new Error(msg);
                            }

                            // Verify the new account has access to the equalizer being repaired
                            const equalizer = equalizers.find(equalizer => equalizer.id == device.getData().id);
                            if (equalizer) {
                                self.log(`Found equalizer with id '${equalizer.id}'`);
                                device.storeCredentialsEncrypted(data.username, data.password);
                                return true;
                            } else {
                                self.error(msg);
                                throw new Error(msg);
                            }
                        }).catch(reason => {
                            self.error(reason);
                            throw reason;
                        });
                }).catch(reason => {
                    self.error(reason);
                    throw reason;
                });
        });

    }
}

module.exports = EqualizerDriver;
