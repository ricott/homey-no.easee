'use strict';

const { App } = require('homey');

class EaseeApp extends App {
	async onInit() {
		this.log('EaseeApp is running...');
	}
}

module.exports = EaseeApp;