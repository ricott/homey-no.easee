'use strict';

const EaseeCharger = require('../lib/easee.js');
const ConnectionManager = require('../lib/connectionManager.js');
const assert = require('assert');
const util = require('util');
var config = require('./config');

var connectionManager = null;

describe('Easee', function () {

    before(function () {
        // runs once before the first test in this block
        connectionManager = new ConnectionManager();
    });

    after(function () {
        // runs once after the last test in this block
        connectionManager = null;
    });

    describe('#getChargers', function () {
        it('should return 2 of them', async () => {
            let tokens = await connectionManager.getTokens(config.credentials.userName, config.credentials.password);
            //console.log(tokens);
            let easee = new EaseeCharger(tokens);
            let chargers = await easee.getChargers();
            assert.strictEqual(chargers.length, 2);
        });
    });

    describe('#getEqualizers', function () {
        it('should return 0 of them', async () => {
            let tokens = await connectionManager.getTokens(config.credentials.userName, config.credentials.password);
            let easee = new EaseeCharger(tokens);
            let equalizers = await easee.getEqualizers();
            //console.log(util.inspect(equalizers, {showHidden: false, depth: null}));
            assert.strictEqual(equalizers.length, 0);
        });
    });
    

    describe('#getChargerConfig', function () {
        it('config', async () => {
            let tokens = await connectionManager.getTokens(config.credentials.userName, config.credentials.password);
            let easee = new EaseeCharger(tokens);
            let chargerConfig = await easee.getChargerConfig(config.charger);
            assert.strictEqual(chargerConfig.isEnabled, true);
        });
    });

    describe('#getChargerDetails', function () {
        it('serial should match', async () => {
            let tokens = await connectionManager.getTokens(config.credentials.userName, config.credentials.password);
            let easee = new EaseeCharger(tokens);
            let chargerDetails = await easee.getChargerDetails(config.charger);
            assert.strictEqual(chargerDetails.serialNumber, config.charger);
        });
    });
    
    describe('#getChargerState', function () {
        it('charger voltage should be above 200', async () => {
            let tokens = await connectionManager.getTokens(config.credentials.userName, config.credentials.password);
            let easee = new EaseeCharger(tokens);
            let chargerState = await easee.getChargerState(config.charger);
            //console.log(chargerState);
            assert.strictEqual((chargerState.voltage>200), true);
        });
    });
    
    describe('#getSiteInfo', function () {
        it('main fuse should be 25 amps', async () => {
            let tokens = await connectionManager.getTokens(config.credentials.userName, config.credentials.password);
            let easee = new EaseeCharger(tokens);
            let chargerSite = await easee.getSiteInfo(config.charger);
            assert.strictEqual(chargerSite.ratedCurrent, 25);
        });
    });

    describe('#getLastMonthChargekWh', function () {
        it('last month charger consumption should be numeric', async () => {
            let tokens = await connectionManager.getTokens(config.credentials.userName, config.credentials.password);
            let easee = new EaseeCharger(tokens);
            let chargerConsumption = await easee.getLastMonthChargekWh(config.charger);
            //console.log(chargerConsumption);
            assert.strictEqual((isNaN(chargerConsumption) === false), true);
        });
    });

/*
    describe('#getLastChargeSessionkWh', function () {
        it('last charge session consumptions should be numeric', async () => {
            let tokens = await connectionManager.getTokens(config.credentials.userName, config.credentials.password);
            let easee = new EaseeCharger(tokens);
            let chargerSession = await easee.getLastChargeSessionkWh(config.charger);
            //console.log(chargerSession);
            assert.strictEqual((isNaN(chargerSession) === false), true);
        });
    });

    describe('#getLast30DaysChargekWh', function () {
        it('last 30 days charge consumption should be numeric', async () => {
            let tokens = await connectionManager.getTokens(config.credentials.userName, config.credentials.password);
            let easee = new EaseeCharger(tokens);
            let chargerConsumption = await easee.getLast30DaysChargekWh(config.charger);
            //console.log(chargerConsumption);
            assert.strictEqual((isNaN(chargerConsumption) === false), true);
        });
    });
*/
/*
    describe('#setDynamicCurrent', function () {
        it('setting dynamic current should not throw an error', async () => {
            let tokens = await connectionManager.getTokens(config.credentials.userName, config.credentials.password);
            let easee = new EaseeCharger(tokens);
            let result = await easee.setDynamicCurrent(14652, 724, 15);
            console.log(result);
            //assert.strictEqual((isNaN(chargerConsumption) === false), true);
        });
    });
*/

});

