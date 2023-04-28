'use strict';

const Easee = require('../../lib/easee.js');
const assert = require('assert');
const util = require('util');
var config = require('../config');

const TokenManager = require('../../lib/tokenManager.js');
var tokenManager = TokenManager;

describe('#Charger', function () {

    it('get charger observations', async () => {
        let tokens = await tokenManager.getTokens(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        const observationIds = [200];
        const values = await easee.getChargerSettings(config.charger);
        console.log(util.inspect(values, { showHidden: false, depth: null }));
        //assert.strictEqual(!isNaN(dynamicCurrent.phase1), true);
    });

    it('should return 2 of them', async () => {
        let tokens = await tokenManager.getTokens(config.credentials.userName, config.credentials.password);
        //console.log(tokens);
        let easee = new Easee(tokens);
        let chargers = await easee.getChargers();
        assert.strictEqual(chargers.length, 2);
    });

    it('config', async () => {
        let tokens = await tokenManager.getTokens(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let chargerConfig = await easee.getChargerConfig(config.charger);
        //console.log(util.inspect(chargerConfig, { showHidden: false, depth: null }));
        assert.strictEqual(chargerConfig.isEnabled, true);
    });

    it('serial should match', async () => {
        let tokens = await tokenManager.getTokens(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let chargerDetails = await easee.getChargerDetails(config.charger);
        //console.log(util.inspect(chargerDetails, { showHidden: false, depth: null }));
        assert.strictEqual(chargerDetails.serialNumber, config.charger);
    });

    it('charger voltage should be above 200', async () => {
        let tokens = await tokenManager.getTokens(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let chargerState = await easee.getChargerState(config.charger);
        //console.log(util.inspect(chargerState, { showHidden: false, depth: null }));
        assert.strictEqual((chargerState.voltage > 200), true);
    });

    it('dynamic current on phase1 should be a number', async () => {
        let tokens = await tokenManager.getTokens(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let dynamicCurrent = await easee.getDynamicCircuitCurrent(config.siteId, config.circuitId);
        //console.log(util.inspect(dynamicCurrent, { showHidden: false, depth: null }));
        assert.strictEqual(!isNaN(dynamicCurrent.phase1), true);
    });

    /*
    describe('#setDynamicCurrent', function () {
        it('setting dynamic current should not throw an error', async () => {
            let tokens = await tokenManager.getTokens(config.credentials.userName, config.credentials.password);
            let easee = new Easee(tokens);
            let result = await easee.setDynamicCurrentPerPhase(config.siteId, config.circuitId, 'NaN', 16, 16);
            console.log(result);
            //assert.strictEqual((isNaN(chargerConsumption) === false), true);
        });
    });
    */
});




