'use strict';
//Docs
//https://www.notion.so/Enumerations-c7fed34ae1ce4d7384d522868f5a0139

exports.decodeChargerMode = function (numType) {
    switch (numType) {
        //iOS app says 'No car connected', but easee.cloud says 'Standby'
        case 1: return 'Standby'; break;
        case 2: return 'Paused'; break;
        case 3: return 'Charging'; break;
        //iOS app says 'Completed', but easee.cloud says 'Car Connected'
        case 4: return 'Completed'; break;
        case 5: return 'Error'; break;
        //iOS app says 'Ready to charge', but easee.cloud says 'Car Connected'
        case 6: return 'Car connected'; break;
        default: return `UNKNOWN (${numType})`; break;
    }
}

exports.decodeNodeType = function (numType) {
    switch (numType) {
        case 0: return 'Unconfigured'; break;
        case 1: return 'Master'; break;
        case 2: return 'Extender'; break;
        case 3: return 'EndDevice'; break;
        default: return `UNKNOWN (${numType})`; break;
    }
}

exports.decodePhaseMode = function (numType) {
    switch (numType) {
        case 1: return 'Locked to single phase'; break;
        case 2: return 'Auto'; break;
        case 3: return 'Locked to three phase'; break;
        default: return `UNKNOWN (${numType})`; break;
    }
}