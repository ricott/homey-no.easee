'use strict';

const Homey = require('homey');
const EaseeCharger = require('../../lib/easee.js');
const TokenManager = require('../../lib/tokenManager.js');

class EqualizerDriver extends Homey.Driver {

  async onInit() {
    this.log(`[Easee Home v${this.getAppVersion()}] Equalizer driver has been initialized`);

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
    this.flowCards['consumption_since_midnight_changed'] =
      this.homey.flow.getDeviceTriggerCard('consumption_since_midnight_changed');

    //Conditions
    this.flowCards['phaseUtilized'] =
      this.homey.flow.getConditionCard('phaseUtilized')
        .registerRunListener(async (args, state) => {
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

    this.flowCards['anyPhaseUtilized'] =
      this.homey.flow.getConditionCard('anyPhaseUtilized')
        .registerRunListener(async (args, state) => {
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
          let easee = new EaseeCharger(tokens);
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
}

module.exports = EqualizerDriver;
