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
    console.log(`Initializing SignalR stream for charger '${this.options.chargerId}'`);
}
util.inherits(EaseeStream, EventEmitter);

/*
EaseeStream.prototype.disconnected = function () {
    return this.connection.state === signalR.HubConnectionState.Disconnected;
}
*/

EaseeStream.prototype.close = function () {
    if (this.connection) {
        console.log(`Closing SignalR stream for charger '${this.options.chargerId}'`);
        return this.connection.stop()
            .then(() => {
                this.connection = null;
                return Promise.resolve(true);
            }).catch(reason => {
                return Promise.reject(reason);
            });
    } else {
        return Promise.resolve(true);
    }
}

EaseeStream.prototype.open = function () {
    var self = this;
    console.log(`Starting SignalR stream for charger '${self.options.chargerId}'`);
    self.connection = new signalR.HubConnectionBuilder()
        .withUrl(config.signalR_URL, { accessTokenFactory: () => self.options.accessToken })
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
        console.log(`Trying to reconnect SignalR stream for charger '${self.options.chargerId}'`);
    });

    self.connection.onclose(error => {
        console.log(`SignalR stream for charger '${self.options.chargerId}' is closed`);
    });

    self.connection.onreconnected(connectionId => {
        console.log(`Successfully reconnected SignalR stream for charger '${self.options.chargerId}'`);
        subscribeWithCurrentState(self.connection, self.options.chargerId);
    });

    self.connection.on('ProductUpdate', (data) => {
        self.emit('Observation', {
            charger: data.mid,
            observation: enums.decodeObservation(data.id),
            value: parseDataStreamValue(data.dataType, data.value)
        });
    });

    //ProductUpdate gets same data
    /*
    self.connection.on('ChargerUpdate', (data) => {
        self.emit('Observation', {
            charger: data.mid,
            observation: enums.decodeObservation(data.id),
            value: parseDataStreamValue(data.dataType, data.value)
        });
        //console.log(`${data.mid}:${enums.decodeObservation(data.id)}:${parseDataStreamValue(data.dataType, data.value)}`);
    });
    */

    self.connection.on('CommandResponse', (data) => {
        self.emit('CommandResponse', {
            charger: self.options.chargerId,
            observation: enums.decodeCommandResponse(data.id),
            accepted: data.wasAccepted,
            resultCode: data.resultCode
        });
    });

    self.connection.start()
        .then(function () {
            subscribeWithCurrentState(self.connection, self.options.chargerId);
        });
}

function subscribeWithCurrentState(connection, chargerId) {
    console.log(`Subscribing with charger: '${chargerId}'`);
    connection.invoke('SubscribeWithCurrentState', chargerId, true);
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