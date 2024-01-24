'use strict';

const Easee = require('../../lib/Easee.js');
const assert = require('assert');
const util = require('util');
var config = require('../config');

const TokenManager = require('../../lib/tokenManager.js');
var tokenManager = TokenManager;

describe('#Charger', function () {

    describe('#setDynamicCurrent', function () {
        it('setting dynamic current should not throw an error', async () => {
            let tokens = await tokenManager.getToken(config.credentials.userName, config.credentials.password);
            let easee = new Easee(tokens);

            // easee.stopCharging(config.charger)
            //     .then(function (response) {
            //         console.log(response);
            //     })
            //     .catch(reason => {
            //         console.error('Failed to start charging, lets try resume');
            //         easee.pauseCharging(config.charger)
            //         .then(function (response) {
            //             console.log(response);
            //         })
            //         .catch(reason => {
            //             console.error('Failed to resume charging, out of luck');
            //         }); 
            //     });
            let startTime = Date.now();
            easee.pauseCharging(config.charger)
                .then(function (response) {
                    console.log(response);
                    console.log(`Time: ${Date.now() - startTime} ms`);
                })
                .catch(reason => {
                    console.error('Test failed');
                    console.error(reason);
                })
            //easee.pauseCharging(config.charger)
            //easee.resumeCharging(config.charger)
            //easee.stopCharging(config.charger)
            //easee.ledStripBrightness(config.charger, 25)
            //easee.setDynamicCurrentPerPhase(config.siteId, config.circuitId, 16, 16, 16)
            /*   .then(function (response) {
                   console.log(response);
               })
               .catch(reason => {
                   console.error('Test failed');
                   console.error(reason);
               });*/

            //assert.strictEqual((isNaN(chargerConsumption) === false), true);
        }).timeout(60 * 60 * 1000);
    });
});




