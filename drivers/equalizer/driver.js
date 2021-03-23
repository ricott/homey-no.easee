'use strict';

const Homey = require('homey');
const EaseeCharger = require('../../lib/easee.js');
const TokenManager = require('../../lib/tokenManager.js');

class EqualizerDriver extends Homey.Driver {

  onInit() {
    this.log('Easee Equalizer driver has been initialized');

    this.flowCards = {};
    this._registerFlows();
    this.tokenManager = TokenManager;
  }

  _registerFlows() {
    this.log('Registering flows');
/*
    //Register triggers
    let triggers = [
      'charger_status_changed'
      //'charger_current_changed'
    ];
    this._registerFlow('trigger', triggers, Homey.FlowCardTriggerDevice);
*/

    /*
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
*/

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
    var self = this;

    socket.on('login', (data, callback) => {
      if (data.username === '' || data.password === '') {
        return callback(null, false);
      }

      self.tokenManager.getTokens(data.username, data.password)
        .then(function (tokens) {
          let easee = new EaseeCharger(tokens);
          easee.getEqualizers().then(function (equalizers) {
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

module.exports = EqualizerDriver;
