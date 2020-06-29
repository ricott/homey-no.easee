'use strict';

const EaseeCharger = require('../lib/easee.js');
const ConnectionManager = require('../lib/connectionManager.js');
const assert = require('assert');
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
            let easee = new EaseeCharger(tokens);
            let chargers = await easee.getChargers();
            assert.equal(chargers.length, 2);
        });
    });

    describe('#getChargerConfig', function () {
        it('config', async () => {
            let tokens = await connectionManager.getTokens(config.credentials.userName, config.credentials.password);
            let easee = new EaseeCharger(tokens);
            let chargerConfig = await easee.getChargerConfig(config.charger);
            assert.equal(chargerConfig.isEnabled, true);
        });
    });

    describe('#getChargerDetails', function () {
        it('config', async () => {
            let tokens = await connectionManager.getTokens(config.credentials.userName, config.credentials.password);
            let easee = new EaseeCharger(tokens);
            let chargerDetails = await easee.getChargerDetails(config.charger);
            assert.equal(chargerDetails.serialNumber, config.charger);
        });
    });
    
    describe('#getChargerState', function () {
        it('config', async () => {
            let tokens = await connectionManager.getTokens(config.credentials.userName, config.credentials.password);
            let easee = new EaseeCharger(tokens);
            let chargerState = await easee.getChargerState(config.charger);
            //console.log(chargerState);
            assert.equal((chargerState.voltage>200), true);
        });
    });
    
    describe('#getSiteInfo', function () {
        it('config', async () => {
            let tokens = await connectionManager.getTokens(config.credentials.userName, config.credentials.password);
            let easee = new EaseeCharger(tokens);
            let chargerSite = await easee.getSiteInfo(config.charger);
            assert.equal(chargerSite.ratedCurrent, 25);
        });
    });

});

