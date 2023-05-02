'use strict';
const util = require('util');
const { App } = require('homey');
const Stats = require('./lib/stats.js');

class EaseeApp extends App {
	async onInit() {
		this.log(`Easee Home v${this.getAppVersion()} is running`);
        this.stats = new Stats();

        this.homey.setInterval(() => {
            this.#printStatsToSettings();
        }, 60 * 1000 * 5);
	}

    #printStatsToSettings() {
        this.homey.settings.set('startOfStats', this.getStats().getInitDatetime(this.homey.clock.getTimezone()));
        this.homey.settings.set('totalInvocations', this.getStats().getTotalInvocations());
        this.homey.settings.set('invocations', util.inspect(this.getStats().getInvocationStats(), { showHidden: false, depth: null }));
        this.homey.settings.set('errors', util.inspect(this.getStats().getErrorList(), { showHidden: false, depth: null }));     
    }

    getStats() {
        return this.stats;
    }

    getAppVersion() {
        return this.homey.manifest.version;
    }
}

module.exports = EaseeApp;