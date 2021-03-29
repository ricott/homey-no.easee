'use strict';

const Easee = require('../../lib/easee.js');
const assert = require('assert');
const util = require('util');
var config = require('../config');

const TokenManager = require('../../lib/tokenManager.js');
var tokenManager = TokenManager;

describe('#Basic Charge Plan', function () {
    it('Create charge plan', async () => {
        let tokens = await tokenManager.getTokens(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let result = await easee.setBasicChargePlan(config.charger,
            '01:00', '04:00', true);
        //console.log(util.inspect(result, {showHidden: false, depth: null}));
        assert.strictEqual(result.device, config.charger);
    });

    it('Get charge plan', async () => {
        let tokens = await tokenManager.getTokens(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let chargePlan = await easee.getBasicChargePlan(config.charger);
        //console.log(util.inspect(chargePlan, { showHidden: false, depth: null }));
        assert.strictEqual(chargePlan.id, config.charger);
    });

    it('Delete charg plan', async () => {
        let tokens = await tokenManager.getTokens(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let chargePlan = await easee.deleteBasicChargePlan(config.charger);
        //console.log(util.inspect(chargePlan, {showHidden: false, depth: null}));
        assert.strictEqual(chargePlan.device, config.charger);
    });
});

