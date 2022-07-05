'use strict';

const apiProtocol = 'https:';
const apiDomain = 'api.easee.cloud'
const apiTimeout = 20000;
const signalR_URL = 'https://api.easee.cloud/hubs/chargers'
const userAgent = 'homey-no.easee'

module.exports = {
    apiProtocol,
    apiDomain,
    apiTimeout,
    signalR_URL,
    userAgent
}