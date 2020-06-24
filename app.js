'use strict';

const Homey = require('homey');

class EaseeApp extends Homey.App {
	
	onInit() {
		this.log('EaseeApp is running...');
	}
}

module.exports = EaseeApp;