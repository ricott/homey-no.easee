'use strict';

const Homey = require('homey');
const Easee = require('../../lib/Easee.js');
const TokenManager = require('../../lib/tokenManager.js');

class ChargerDriver extends Homey.Driver {

  async onInit() {
    this.log(`[Easee Home v${this.getAppVersion()}] Charger driver has been initialized`);

    this.flowCards = {};
    this._registerFlows();
    this.tokenManager = TokenManager;
  }

  getAppVersion() {
    return this.homey.manifest.version;
  }

  _registerFlows() {
    this.log('Registering flows');

    //Triggers
    this.flowCards['charger_status_changed'] = this.homey.flow.getDeviceTriggerCard('charger_status_changed');

    //Conditions
    this.flowCards['chargerStatus'] =
      this.homey.flow.getConditionCard('chargerStatus')
        .registerRunListener(async (args, state) => {
          this.log(`[${args.device.getName()}] Condition 'chargerStatus' triggered`);
          let status = args.device.getCapabilityValue('charger_status');
          this.log(`[${args.device.getName()}] - current status: ${status}, condition status: '${args.status}`);

          if (status === args.status) {
            return true;
          } else {
            return false;
          }
        });

    //Actions
    let actionName = 'rebootCharger';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'rebootCharger' triggered`);
        return args.device.rebootCharger()
          .then(function (result) {
            return Promise.resolve(true);
          }).catch(reason => {
            return Promise.reject('Failed to reboot charger');
          });
      });

    actionName = 'disableSmartCharging';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'disableSmartCharging' triggered`);
        let errMsg = `Failed to disable smart charging`;
        return args.device.disableSmartCharging()
          .then(function (result) {
            return Promise.resolve(true);
          }).catch(reason => {
            return Promise.reject(errMsg);
          });
      });

    actionName = 'pauseSmartCharging';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'pauseSmartCharging' triggered`);
        let errMsg = `Failed to pause smart charging`;
        return args.device.pauseSmartCharging()
          .then(function (result) {
            return Promise.resolve(true);
          }).catch(reason => {
            return Promise.reject(errMsg);
          });
      });

    actionName = 'enableSmartCharging';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'enableSmartCharging' triggered`);
        let errMsg = `Failed to enable smart charging`;
        return args.device.enableSmartCharging()
          .then(function (result) {
            return Promise.resolve(true);
          }).catch(reason => {
            return Promise.reject(errMsg);
          });
      });

    actionName = 'overrideSchedule';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'overrideSchedule' triggered`);
        return args.device.overrideSchedule()
          .then(function (result) {
            return Promise.resolve(true);
          }).catch(reason => {
            return Promise.reject('Failed to override schedule');
          });
      });

    actionName = 'deleteSchedule';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'deleteSchedule' triggered`);
        return args.device.deleteSchedule()
          .then(function (result) {
            return Promise.resolve(true);
          }).catch(reason => {
            return Promise.reject('Failed to delete schedule');
          });
      });

    actionName = 'createSchedule';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'createSchedule' triggered`);
        this.log(`[${args.device.getName()}] - startTime: '${args.startTime}'`);
        this.log(`[${args.device.getName()}] - endTime: '${args.endTime}'`);
        this.log(`[${args.device.getName()}] - repeat: '${args.repeat}'`);

        return args.device.createSchedule(args.startTime, args.endTime, args.repeat)
          .then(function (result) {
            return Promise.resolve(true);
          }).catch(reason => {
            this.log(reason);
            return Promise.reject('Failed to create schedule');
          });
      });

    actionName = 'toggleCharger';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'toggleCharger' triggered`);
        return args.device.toggleCharging()
          .then(function (result) {
            return Promise.resolve(true);
          }).catch(reason => {
            return Promise.reject('Failed to toggle charging');
          });
      });

    actionName = 'chargerControl';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'chargerControl' triggered`);
        this.log(`[${args.device.getName()}] - action: '${args.chargerAction}'`);

        let errMsg = `Failed to change status to '${args.chargerAction}'`;
        if (args.chargerAction === 'START') {
          return args.device.startCharging()
            .then(function (result) {
              return Promise.resolve(true);
            }).catch(reason => {
              return Promise.reject(errMsg);
            });

        } else if (args.chargerAction === 'STOP') {
          return args.device.stopCharging()
            .then(function (result) {
              return Promise.resolve(true);
            }).catch(reason => {
              return Promise.reject(errMsg);
            });

        } else if (args.chargerAction === 'PAUSE') {
          return args.device.pauseCharging()
            .then(function (result) {
              return Promise.resolve(true);
            }).catch(reason => {
              return Promise.reject(errMsg);
            });

        } else if (args.chargerAction === 'RESUME') {
          return args.device.resumeCharging()
            .then(function (result) {
              return Promise.resolve(true);
            }).catch(reason => {
              return Promise.reject(errMsg);
            });
        }
      });

    actionName = 'circuitCurrentControlPerPhase';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'circuitCurrentControlPerPhase' triggered`);
        this.log(`[${args.device.getName()}] - current: '${args.current1}/${args.current2}/${args.current3}' amps`);
        //Don't set charge current to higher than max value
        let current1 = Math.min(args.current1, args.device.getSettings().circuitFuse);
        let current2 = Math.min(args.current2, args.device.getSettings().circuitFuse);
        let current3 = Math.min(args.current3, args.device.getSettings().circuitFuse);
        this.log(`[${args.device.getName()}] - actual used: '${current1}/${current2}/${current3}' Amps`);

        return args.device.setDynamicCurrentPerPhase(current1, current2, current3)
          .then(function (result) {
            return Promise.resolve(true);
          }).catch(reason => {
            this.log(reason);
            return Promise.reject(`Failed to set dynamic Circuit current, reason: ${reason.message}`);
          });
      });

    actionName = 'circuitCurrentControl';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'circuitCurrentControl' triggered`);
        this.log(`[${args.device.getName()}] - current: '${args.current}' amps`);
        //Don't set charge current to higher than max value
        let current = Math.min(args.current, args.device.getSettings().circuitFuse);
        this.log(`[${args.device.getName()}] - actual used: '${current}' Amps`);

        return args.device.setDynamicCurrentPerPhase(current, current, current)
          .then(function (result) {
            return Promise.resolve(true);
          }).catch(reason => {
            return Promise.reject(`Failed to set dynamic Circuit current, reason: ${reason.message}`);
          });
      });

    actionName = 'chargerState';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'chargerState' triggered`);
        this.log(`[${args.device.getName()}] - state: '${args.chargerState}'`);

        let errMsg = `Failed to change state to '${args.chargerState}'`;
        let chargerState = (args.chargerState === 'true') ? true : false;
        return args.device.setChargerState(chargerState)
          .then(function (result) {
            return Promise.resolve(true);
          }).catch(reason => {
            return Promise.reject(errMsg);
          });
      });

    actionName = 'enableIdleCurrent';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'enableIdleCurrent' triggered`);
        this.log(`[${args.device.getName()}] - state: '${args.idleCurrent}'`);

        let errMsg = `Failed to change idle current to '${args.idleCurrent}'`;
        let idleCurrent = (args.idleCurrent === 'true') ? true : false;
        return args.device.enableIdleCurrent(idleCurrent)
          .then(function (result) {
            return Promise.resolve(true);
          }).catch(reason => {
            return Promise.reject(errMsg);
          });
      });

    actionName = 'lockCablePermanently';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'lockCablePermanently' triggered`);
        this.log(`[${args.device.getName()}] - state: '${args.lockCable}'`);

        let errMsg = `Failed to change lock cable permanently to '${args.lockCable}'`;
        let lockCable = (args.lockCable === 'true') ? true : false;
        return args.device.lockCablePermanently(lockCable)
          .then(function (result) {
            return Promise.resolve(true);
          }).catch(reason => {
            return Promise.reject(errMsg);
          });
      });

    actionName = 'ledStripBrightness';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'ledStripBrightness' triggered`);
        this.log(`[${args.device.getName()}] - brightness: '${args.ledBrightness}'`);

        let errMsg = `Failed to change brightness to '${args.ledBrightness}'`;
        return args.device.ledStripBrightness(args.ledBrightness)
          .then(function (result) {
            return Promise.resolve(true);
          }).catch(reason => {
            return Promise.reject(errMsg);
          });
      });

    actionName = 'decreaseCircuitCurrent';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'decreaseCircuitCurrent' triggered`);
        //Lets fetch the current dynamic current via API, to make sure we are adjusting the real current
        return args.device.getDynamicCurrent()
          .then(dynamicCurrent => {
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

            return args.device.setDynamicCurrentPerPhase(
              dynamicCurrent.phase1, dynamicCurrent.phase2, dynamicCurrent.phase3)
              .then(function (result) {
                return Promise.resolve(true);
              }).catch(reason => {
                return Promise.reject('Failed to decrease dynamic circuit current');
              });
          }).catch(reason => {
            return Promise.reject('Failed to decrease dynamic circuit current');
          });
      });

    actionName = 'increaseCircuitCurrent';
    this.flowCards[actionName] = this.homey.flow.getActionCard(actionName)
      .registerRunListener(async (args) => {
        this.log(`[${args.device.getName()}] Action 'increaseCircuitCurrent' triggered`);
        //Lets fetch the current dynamic current via API, to make sure we are adjusting the real current
        return args.device.getDynamicCurrent()
          .then(dynamicCurrent => {
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

            return args.device.setDynamicCurrentPerPhase(
              dynamicCurrent.phase1, dynamicCurrent.phase2, dynamicCurrent.phase3)
              .then(function (result) {
                return Promise.resolve(true);
              }).catch(reason => {
                return Promise.reject('Failed to increase dynamic circuit current');
              });
          }).catch(reason => {
            return Promise.reject('Failed to increase dynamic circuit current');
          });
      });
  }

  triggerDeviceFlow(flow, tokens, device) {
    this.log(`[${device.getName()}] Triggering device flow '${flow}' with tokens`, tokens);
    this.flowCards[flow].trigger(device, tokens);
  }

  async onPair(session) {
    let devices = [];
    let self = this;

    session.setHandler('login', async (data) => {
      if (data.username == '' || data.password == '') {
        throw new Error('User name and password is mandatory!');
      }

      return self.tokenManager.getTokens(data.username, data.password)
        .then(function (tokens) {
          const easee = new Easee(tokens);
          return easee.getChargers().then(function (chargers) {
            chargers.forEach(charger => {
              let name = 'charger.name';
              if (charger.id != charger.name) {
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
}

module.exports = ChargerDriver;
