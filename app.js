'use strict';

const { App } = require('homey');
const { Log } = require('homey-log');

class EaseeApp extends App {
	async onInit() {
		this.homeyLog = new Log({ homey: this.homey });
		this.log('EaseeApp is running...');
	}
}

module.exports = EaseeApp;