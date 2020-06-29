'use strict';

const Homey = require('homey');
const EaseeCharger = require('../../lib/easee.js');
const ConnectionManager = require('../../lib/connectionManager.js');

class ChargerDriver extends Homey.Driver {

  onInit() {
    this.log('Easee Charger driver has been initialized');

    this.flowCards = {};
    this._registerFlows();
    this.connectionManager = new ConnectionManager();
  }

  //Creates a new one if none exists
  //otherwise returns existing tokens
  getTokens(username, password) {
    return this.connectionManager.getTokens(username, password)
      .then(function (tokens) {
        return tokens;
      }).catch(reason => {
        return Promise.reject(reason);
      });
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
        this.log('Flow condition.chargerStatus');
        let status = args.device.getCapabilityValue('charger_status');
        this.log(`- charger.status: ${status}`);
        this.log(`- condition.status: '${args.status}'`);

        if (status === args.status) {
          return true;
        } else {
          return false;
        }
      });

    //Register actions
    triggers = [
      'chargerControl',
      'chargerCurrentControl',
      'toggleCharger'
    ];
    this._registerFlow('action', triggers, Homey.FlowCardAction);

    this.flowCards['action.toggleCharger'].registerRunListener((args, state) => {
      this.log('----- Charger toggle action triggered');

      return args.device.toggleCharging()
        .then(function (result) {
          return Promise.resolve(true);
        }).catch(reason => {
          return Promise.reject('Failed to toggle charging');
        });
    });

    this.flowCards['action.chargerControl'].registerRunListener((args, state) => {
      this.log('----- Charger status control action triggered');
      this.log(`Action: '${args.chargerAction}'`);

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

    this.flowCards['action.chargerCurrentControl'].registerRunListener((args, state) => {
      this.log('----- Charger current control action triggered');
      this.log(`Current: '${args.current}' amps`);
      //Don't set charge current to higher than max value
      let current = Math.min(args.current, args.device.getSettings().chargerFuse);
      this.log(`Actual used: '${current}' Amps`);

      return args.device.setDynamicCurrent(current)
        .then(function (result) {
          return Promise.resolve(true);
        }).catch(reason => {
          return Promise.reject('Failed to set dynamic charger current');
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
      this.log('- device trigger for ', device.getName());
      this.flowCards[flow].trigger(device, tokens);
    }
    else if (this.flowCards[flow] instanceof Homey.FlowCardTrigger) {
      this.log('- regular trigger');
      this.flowCards[flow].trigger(tokens);
    }
  }

  onPair(socket) {
    let devices = [];

    socket.on('login', (data, callback) => {
      if (data.username === '' || data.password === '') {
        return callback(null, false);
      }

      this.getTokens(data.username, data.password)
        .then(function (tokens) {
          let easee = new EaseeCharger(tokens);
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
            console.error(reason);
            callback(null, false);
          });
        }).catch(reason => {
          console.error(reason);
          callback(null, false);
        });

    });

    socket.on('list_devices', (data, callback) => {
      callback(null, devices);
    });
  }
}

module.exports = ChargerDriver;
