'use strict';

const Easee = require('../../lib/Easee.js');
const assert = require('assert');
const util = require('util');
var config = require('../config');

const TokenManager = require('../../lib/tokenManager.js');
var tokenManager = TokenManager;

describe('#Settings', function () {

    it('setMaxChargerCurrent', async () => {
        let tokens = await tokenManager.getToken(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let result = await easee.setMaxChargerCurrent(config.charger, 20);
        //console.log(util.inspect(result, { showHidden: false, depth: null }));
        //assert.strictEqual(result[0].device, config.charger);
    });
/*
    it('xyz', async () => {
        let tokens = await tokenManager.getToken(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let result = await easee.disableSmartCharging(config.charger);
        console.log(util.inspect(result, { showHidden: false, depth: null }));
        //assert.strictEqual((isNaN(chargerConsumption) === false), true);
    });
    */
});


