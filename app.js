'use strict';

const { App } = require('homey');

class EaseeApp extends App {
	async onInit() {
		this.log(`Easee Home v${this.getAppVersion()} is running`);
	}

    getAppVersion() {
        return this.homey.manifest.version;
    }
}

module.exports = EaseeApp;