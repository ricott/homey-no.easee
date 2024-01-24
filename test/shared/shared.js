'use strict';

const Easee = require('../../lib/Easee.js');
const assert = require('assert');
const util = require('util');
var config = require('../config');

const TokenManager = require('../../lib/tokenManager.js');
var tokenManager = TokenManager;

describe('Shared functions', function () {
    it('Site main fuse should be 25 amps', async () => {
        let tokens = await tokenManager.getToken(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let chargerSite = await easee.getSiteInfo(config.charger);
        assert.strictEqual(chargerSite.ratedCurrent, 25);
    });
});

