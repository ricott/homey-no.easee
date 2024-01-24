'use strict';

const Easee = require('../../lib/Easee.js');
const assert = require('assert');
const util = require('util');
var config = require('../config');

const TokenManager = require('../../lib/tokenManager.js');
var tokenManager = TokenManager;

describe('Statistics', function () {
    it('last month charger consumption should be numeric', async () => {
        let tokens = await tokenManager.getToken(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let chargerConsumption = await easee.getLastMonthChargekWh(config.charger);
        //console.log(chargerConsumption);
        assert.strictEqual((isNaN(chargerConsumption) === false), true);
    });

    it('last charge session consumptions should be numeric', async () => {
        let tokens = await tokenManager.getToken(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let chargerSession = await easee.getLastChargeSessionkWh(config.charger);
        //console.log(chargerSession);
        assert.strictEqual((isNaN(chargerSession) === false), true);
    });

    it('last 30 days charge consumption should be numeric', async () => {
        let tokens = await tokenManager.getToken(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let chargerConsumption = await easee.getLast30DaysChargekWh(config.charger);
        //console.log(chargerConsumption);
        assert.strictEqual((isNaN(chargerConsumption) === false), true);
    });
});

