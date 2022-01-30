'use strict';

const Easee = require('../../lib/easee.js');
const assert = require('assert');
const util = require('util');
var config = require('../config');

const TokenManager = require('../../lib/tokenManager.js');
var tokenManager = TokenManager;

describe('#Smart charging', function () {

    it('xyz', async () => {
        let tokens = await tokenManager.getTokens(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let result = await easee.enableSmartCharging(config.charger);
        //console.log(util.inspect(result, { showHidden: false, depth: null }));
        //assert.strictEqual(result.device, config.charger);
    });
/*
    it('xyz', async () => {
        let tokens = await tokenManager.getTokens(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let result = await easee.disableSmartCharging(config.charger);
        console.log(util.inspect(result, { showHidden: false, depth: null }));
        //assert.strictEqual((isNaN(chargerConsumption) === false), true);
    });
    */
});


