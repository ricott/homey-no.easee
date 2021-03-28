'use strict';

const Easee = require('../../lib/easee.js');
const assert = require('assert');
const util = require('util');
var config = require('../config');

const TokenManager = require('../../lib/tokenManager.js');
var tokenManager = TokenManager;

describe('#Equalizer', function () {
    it('should return 1 of them', async () => {
        let tokens = await tokenManager.getTokens(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let equalizers = await easee.getEqualizers();
        //console.log(util.inspect(equalizers, {showHidden: false, depth: null}));
        assert.strictEqual(equalizers.length, 1);
    });

    it('equalizer id should match', async () => {
        let tokens = await tokenManager.getTokens(config.credentials.userName, config.credentials.password);
        let easee = new Easee(tokens);
        let site = await easee.getEqualizerSiteInfo(config.equalizer);
        //console.log(util.inspect(site, {showHidden: false, depth: null}));
        assert.strictEqual(site.equalizers[0].id, config.equalizer);
    });
});

