'use strict';

var signalR = require("@microsoft/signalr");
var EventEmitter = require('events');
var util = require('util');
const config = require('./const.js');
const enums = require('./enums.js');

function EaseeStream(options) {
    EventEmitter.call(this);
    if (options == null) { options = {} };
    this.options = options;
    console.log(`Initializing SignalR stream for device '${this.options.deviceId}'`);
}
util.inherits(EaseeStream, EventEmitter);

EaseeStream.prototype.close = function () {
    console.log(`Closing SignalR stream for device '${this.options.deviceId}'`);
    if (this.connection) {
        this.connection.stop();
    }
    this.connection = null;
}

EaseeStream.prototype.open = function () {
    var self = this;
    console.log(`Starting SignalR stream for device '${self.options.deviceId}'`);
    self.connection = new signalR.HubConnectionBuilder()
        .withUrl(config.signalR_URL, { accessTokenFactory: () => self.options.accessToken, headers: {'User-Agent': `${config.userAgent}/${self.options.appVersion}`} })
        .withAutomaticReconnect({
            nextRetryDelayInMilliseconds: retryContext => {
                if (retryContext.elapsedMilliseconds < 60000) {
                    // If we've been reconnecting for less than 60 seconds so far,
                    // wait between 0 and 10 seconds before the next reconnect attempt.
                    return Math.random() * 10000;
                } else if (retryContext.elapsedMilliseconds > 60000 && retryContext.elapsedMilliseconds < 3600000) {
                    // If we've been reconnecting for less than 1 hour so far,
                    // wait 1 minute
                    return 60000;
                } else {
                    // Try forever once every 5 minutes
                    return 300000;
                }
            }
        })
        .configureLogging(signalR.LogLevel.Error)
        .build();

    //Set keep alive to 10 seconds
    self.connection.keepAliveIntervalInMilliseconds = 10000;

    self.connection.onreconnecting(error => {
        console.log(`Trying to reconnect SignalR stream for device '${self.options.deviceId}'`);
    });

    self.connection.onclose(error => {
        console.log(`SignalR stream for device '${self.options.deviceId}' is closed`);
    });

    self.connection.onreconnected(connectionId => {
        console.log(`Successfully reconnected SignalR stream for device '${self.options.deviceId}'`);
        subscribeWithCurrentState(self.connection, self.options.deviceId);
    });

    self.connection.on('ProductUpdate', (data) => {
        let decodedObservation = data.id;
        if (self.options.deviceType == enums.deviceTypes().CHARGER) {
            decodedObservation = enums.decodeChargerObservation(data.id);
        } else if (self.options.deviceType == enums.deviceTypes().EQUALIZER) {
            decodedObservation = enums.decodeEqualizerObservation(data.id);
        }

        self.emit('Observation', {
            device: data.mid,
            observation: decodedObservation,
            value: parseDataStreamValue(data.dataType, data.value)
        });
    });

    //ProductUpdate gets same data
    /*
    self.connection.on('ChargerUpdate', (data) => {
        self.emit('Observation', {
            device: data.mid,
            observation: enums.decodeChargerObservation(data.id),
            value: parseDataStreamValue(data.dataType, data.value)
        });
        //console.log(`${data.mid}:${enums.decodeChargerObservation(data.id)}:${parseDataStreamValue(data.dataType, data.value)}`);
    });
    */

    self.connection.on('CommandResponse', (data) => {
        let decodedObservation = data.id;
        if (self.options.deviceType == enums.deviceTypes().CHARGER) {
            decodedObservation = enums.decodeChargerCommandResponse(data.id);
        } else if (self.options.deviceType == enums.deviceTypes().EQUALIZER) {
            decodedObservation = enums.decodeEqualizerCommandResponse(data.id);
        }

        self.emit('CommandResponse', {
            device: self.options.deviceId,
            observation: decodedObservation,
            accepted: data.wasAccepted,
            resultCode: data.resultCode
        });
    });

    self.connection.start()
        .then(function () {
            subscribeWithCurrentState(self.connection, self.options.deviceId);
        });
}

function subscribeWithCurrentState(connection, deviceId) {
    console.log(`Subscribing with device: '${deviceId}'`);
    connection.invoke('SubscribeWithCurrentState', deviceId, true);
}

function parseDataStreamValue(dataType, value) {
    let returnVal = value;
    switch (dataType) {
        case 2:
            if (value == "0") {
                returnVal = false;
            } else {
                returnVal = true;
            }
            break;
        case 3:
            returnVal = parseFloat(value);
            break;
        case 4:
            returnVal = parseInt(value);
            break;
        default:
            break;
    }
    return returnVal;
}

exports = module.exports = EaseeStream;