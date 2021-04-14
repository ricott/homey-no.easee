'use strict';

const Homey = require('homey');
const HomeyModule = require('homey');
const EaseeCharger = require('../../lib/easee.js');
const TokenManager = require('../../lib/tokenManager.js');

class EqualizerDriver extends Homey.Driver {

  onInit() {
    this.updateAppVersion();
    this.log(`[Easee Home v${this.getAppVersion()}] Equalizer driver has been initialized`);

    this.flowCards = {};
    this._registerFlows();
    this.tokenManager = TokenManager;
  }

  updateAppVersion() {
    let version = 'unknown';
    if (HomeyModule && HomeyModule.manifest) {
      version = HomeyModule.manifest.version || version;
    }
    this.appVersion = version;
  }

  getAppVersion() {
    return this.appVersion;
  }

  _registerFlows() {
    this.log('Registering flows');

    //Register triggers
    let triggers = [
      'phase_load_changed',
      'consumption_since_midnight_changed'
    ];
    this._registerFlow('trigger', triggers, Homey.FlowCardTriggerDevice);

    //Register conditions
    triggers = [
      'phaseUtilized',
      'anyPhaseUtilized'
    ];
    this._registerFlow('condition', triggers, Homey.FlowCardCondition);

    this.flowCards['condition.phaseUtilized']
      .registerRunListener((args, state, callback) => {
        this.log(`[${args.device.getName()}] Flow condition.phaseUtilized`);
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

    this.flowCards['condition.anyPhaseUtilized']
      .registerRunListener((args, state, callback) => {
        this.log(`[${args.device.getName()}] Flow condition.anyPhaseUtilized`);
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

  _registerFlow(type, keys, cls) {
    keys.forEach(key => {
      this.log(`- flow '${type}.${key}'`);
      this.flowCards[`${type}.${key}`] = new cls(key).register();
    });
  }

  triggerFlow(flow, tokens, device) {
    //this.log(`Triggering flow '${flow}' with tokens`, tokens);
    if (this.flowCards[flow] instanceof Homey.FlowCardTriggerDevice) {
      this.flowCards[flow].trigger(device, tokens);
    } else if (this.flowCards[flow] instanceof Homey.FlowCardTrigger) {
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
