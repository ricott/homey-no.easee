'use strict';

const enums = require('../lib/enums.js');

//console.log(enums.decodeCarChargingState(true));
//console.log(enums.getCarChargingState());

//console.log(enums.DETECTED_POWER_GRID_TYPE.TN_3_PHASE.key);

console.log(enums.decodeChargerMode(3) == enums.decodeChargerMode('Charging'));

