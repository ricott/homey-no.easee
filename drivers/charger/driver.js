'use strict';

const Homey = require('homey');
const Easee = require('../../lib/easee.js');
const TokenManager = require('../../lib/tokenManager.js');

class ChargerDriver extends Homey.Driver {

  onInit() {
    this.log('Easee Charger driver has been initialized');

    this.flowCards = {};
    this._registerFlows();
    this.tokenManager = TokenManager;
  }

  _registerFlows() {
    this.log('Registering flows');

    //Register triggers
    let triggers = [
      'charger_status_changed'
      //'charger_current_changed'
    ];
    this._registerFlow('trigger', triggers, Homey.FlowCardTriggerDevice);

    //Register conditions
    triggers = [
      'chargerStatus'
    ];
    this._registerFlow('condition', triggers, Homey.FlowCardCondition);

    this.flowCards['condition.chargerStatus']
      .registerRunListener((args, state, callback) => {
        this.log(`[${args.device.getName()}] Flow condition.chargerStatus`);
        let status = args.device.getCapabilityValue('charger_status');
        this.log(`[${args.device.getName()}] charger.status: ${status}`);
        this.log(`[${args.device.getName()}] condition.status: '${args.status}'`);

        if (status === args.status) {
          return true;
        } else {
          return false;
        }
      });

    //Register actions
    triggers = [
      'chargerControl',
      'circuitCurrentControl',
      'circuitCurrentControlPerPhase',
      'toggleCharger',
      'chargerState',
      'enableIdleCurrent',
      'lockCablePermanently',
      'ledStripBrightness',
      'smartCharging',
      'overrideSchedule'
    ];
    this._registerFlow('action', triggers, Homey.FlowCardAction);

    this.flowCards['action.overrideSchedule'].registerRunListener((args, state) => {
      this.log(`[${args.device.getName()}] Charger override schedule triggered`);

      return args.device.overrideSchedule()
        .then(function (result) {
          return Promise.resolve(true);
        }).catch(reason => {
          return Promise.reject('Failed to override schedule');
        });
    });

    this.flowCards['action.toggleCharger'].registerRunListener((args, state) => {
      this.log(`[${args.device.getName()}] Charger toggle action triggered`);

      return args.device.toggleCharging()
        .then(function (result) {
          return Promise.resolve(true);
        }).catch(reason => {
          return Promise.reject('Failed to toggle charging');
        });
    });

    this.flowCards['action.chargerControl'].registerRunListener((args, state) => {
      this.log(`[${args.device.getName()}] Charger status control action triggered`);
      this.log(`[${args.device.getName()}] action: '${args.chargerAction}'`);

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

    this.flowCards['action.circuitCurrentControlPerPhase'].registerRunListener((args, state) => {
      this.log(`[${args.device.getName()}] Charger Circuit current control per phase action triggered`);
      this.log(`[${args.device.getName()}] current: '${args.current1}/${args.current2}/${args.current3}' amps`);
      //Don't set charge current to higher than max value
      let current1 = Math.min(args.current1, args.device.getSettings().chargerFuse);
      let current2 = Math.min(args.current2, args.device.getSettings().chargerFuse);
      let current3 = Math.min(args.current3, args.device.getSettings().chargerFuse);
      this.log(`[${args.device.getName()}] actual used: '${current1}/${current2}/${current3}' Amps`);

      return args.device.setDynamicCurrentPerPhase(current1, current2, current3)
        .then(function (result) {
          return Promise.resolve(true);
        }).catch(reason => {
          this.log(reason);
          return Promise.reject('Failed to set dynamic Circuit current');
        });
    });

    this.flowCards['action.circuitCurrentControl'].registerRunListener((args, state) => {
      this.log(`[${args.device.getName()}] Charger Circuit current control action triggered`);
      this.log(`[${args.device.getName()}] current: '${args.current}' amps`);
      //Don't set charge current to higher than max value
      let current = Math.min(args.current, args.device.getSettings().chargerFuse);
      this.log(`[${args.device.getName()}] actual used: '${current}' Amps`);

      return args.device.setDynamicCurrentPerPhase(current, current, current)
        .then(function (result) {
          return Promise.resolve(true);
        }).catch(reason => {
          return Promise.reject('Failed to set dynamic Circuit current');
        });
    });

    this.flowCards['action.chargerState'].registerRunListener((args, state) => {
      this.log(`[${args.device.getName()}] Charger state control action triggered`);
      this.log(`[${args.device.getName()}] state: '${args.chargerState}'`);

      let errMsg = `Failed to change state to '${args.chargerState}'`;
      let chargerState = (args.chargerState === 'true') ? true : false;
      return args.device.setChargerState(chargerState)
        .then(function (result) {
          return Promise.resolve(true);
        }).catch(reason => {
          return Promise.reject(errMsg);
        });
    });

    this.flowCards['action.smartCharging'].registerRunListener((args, state) => {
      this.log(`[${args.device.getName()}] Charger smart charging action triggered`);
      this.log(`[${args.device.getName()}] smart charging: '${args.option}'`);

      let errMsg = `Failed to change smart charging to '${args.option}'`;
      let option = (args.option === 'true') ? true : false;
      return args.device.setSmartCharging(option)
        .then(function (result) {
          return Promise.resolve(true);
        }).catch(reason => {
          return Promise.reject(errMsg);
        });
    });

    this.flowCards['action.enableIdleCurrent'].registerRunListener((args, state) => {
      this.log(`[${args.device.getName()}] Charger idle current control action triggered`);
      this.log(`[${args.device.getName()}] state: '${args.idleCurrent}'`);

      let errMsg = `Failed to change idle current to '${args.idleCurrent}'`;
      let idleCurrent = (args.idleCurrent === 'true') ? true : false;
      return args.device.enableIdleCurrent(idleCurrent)
        .then(function (result) {
          return Promise.resolve(true);
        }).catch(reason => {
          return Promise.reject(errMsg);
        });
    });

    this.flowCards['action.lockCablePermanently'].registerRunListener((args, state) => {
      this.log(`[${args.device.getName()}] Charger lock cable permanently control action triggered`);
      this.log(`[${args.device.getName()}] state: '${args.lockCable}'`);

      let errMsg = `Failed to change lock cable permanently to '${args.lockCable}'`;
      let lockCable = (args.lockCable === 'true') ? true : false;
      return args.device.lockCablePermanently(lockCable)
        .then(function (result) {
          return Promise.resolve(true);
        }).catch(reason => {
          return Promise.reject(errMsg);
        });
    });

    this.flowCards['action.ledStripBrightness'].registerRunListener((args, state) => {
      this.log(`[${args.device.getName()}] Charger led brightness control action triggered`);
      this.log(`[${args.device.getName()}] brightness: '${args.ledBrightness}'`);

      let errMsg = `Failed to change brightness to '${args.ledBrightness}'`;
      return args.device.ledStripBrightness(args.ledBrightness)
        .then(function (result) {
          return Promise.resolve(true);
        }).catch(reason => {
          return Promise.reject(errMsg);
        });
    });
  }

  _registerFlow(type, keys, cls) {
    keys.forEach(key => {
      this.log(`- flow '${type}.${key}'`);
      this.flowCards[`${type}.${key}`] = new cls(key).register();
    });
  }

  triggerFlow(flow, tokens, device) {
    this.log(`Triggering flow '${flow}' with tokens`, tokens);
    if (this.flowCards[flow] instanceof Homey.FlowCardTriggerDevice) {
      this.log(`[${device.getName()}] device trigger`);
      this.flowCards[flow].trigger(device, tokens);
    }
    else if (this.flowCards[flow] instanceof Homey.FlowCardTrigger) {
      this.log('- regular trigger');
      this.flowCards[flow].trigger(tokens);
    }
  }

  onPair(socket) {
    let devices = [];
    var self = this;

    socket.on('login', (data, callback) => {
      if (data.username === '' || data.password === '') {
        return callback(null, false);
      }

      self.tokenManager.getTokens(data.username, data.password)
        .then(function (tokens) {
          let easee = new Easee(tokens);
          easee.getChargers().then(function (chargers) {
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

            callback(null, true);

          }).catch(reason => {
            self.error(reason);
            callback(null, false);
          });
        }).catch(reason => {
          self.error(reason);
          callback(reason);
        });
    });

    socket.on('list_devices', (data, callback) => {
      callback(null, devices);
    });
  }
}

module.exports = ChargerDriver;
