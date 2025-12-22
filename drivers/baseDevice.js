'use strict';

const Homey = require('homey');
const TokenManager = require('../lib/tokenManager.js');
const crypto = require('crypto');
const algorithm = 'aes-256-cbc';

class BaseDevice extends Homey.Device {

    tokenManager = TokenManager;

    // Override this method in child classes to implement custom availability logic
    _shouldDeviceBeAvailable() {
        return true;
    }

    async setDeviceAvailable() {
        try {
            if (this._shouldDeviceBeAvailable()) {
                await this.setAvailable();
            } else {
                this.logMessage('Device cannot be made available');
            }
        } catch (error) {
            this.error('Failed to set device available:', error);
        }
    }

    async setDeviceUnavailable(message) {
        try {
            await this.setUnavailable(message);
        } catch (error) {
            this.error('Failed to set device unavailable:', error);
        }
    }

    async refreshAccessToken() {
        try {
            const token = await this.tokenManager.getToken(
                this.getUsername(),
                this.getPassword(),
                this
            );

            if (this.getToken()?.access_token !== token.access_token) {
                this.logMessage('We have a new access token from TokenManager');
            }

            await this.setToken(token);

            await this.setDeviceAvailable();
        } catch (error) {
            this.error('Failed to refresh access token:', error);

            // Check if it's an invalid credentials error
            if (error.message && error.message.includes('InvalidUserPassword')) {
                // Set device as unavailable
                await this.setDeviceUnavailable('Username or password is invalid! Please use the repair function on the device to reset the credentials.');
            }
        }
    }

    getToken() {
        return this.getStoreValue('tokens');
    }

    async setToken(tokens) {
        await this.updateStoreValue('tokens', tokens);
    }

    async storeCredentialsEncrypted(plainUser, plainPassword) {
        this.logMessage(`Storing encrypted credentials for user '${plainUser}'`);
        await this.homey.settings.set(`${this.getData().id}.username`, this.encryptText(plainUser));
        await this.homey.settings.set(`${this.getData().id}.password`, this.encryptText(plainPassword));

        //Remove unencrypted credentials passed from driver
        await this.unsetStoreValue('username');
        await this.unsetStoreValue('password');
    }

    getUsername() {
        return this.decryptText(this.homey.settings.get(`${this.getData().id}.username`));
    }

    getPassword() {
        return this.decryptText(this.homey.settings.get(`${this.getData().id}.password`));
    }

    encryptText(text) {
        let iv = crypto.randomBytes(16);
        let cipher = crypto.createCipheriv(algorithm, Buffer.from(Homey.env.ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
    }

    decryptText(text) {
        let iv = Buffer.from(text.iv, 'hex');
        let encryptedText = Buffer.from(text.encryptedData, 'hex');
        let decipher = crypto.createDecipheriv(algorithm, Buffer.from(Homey.env.ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

    async _handleErrorEvent(error) {
        this.error('Houston we have a problem', error);

        const errorMessage = this._formatErrorMessage(error);
        const timeString = new Date().toLocaleString('sv-SE', {
            hour12: false,
            timeZone: this.homey.clock.getTimezone()
        });

        try {
            await this.setSettings({
                last_error: `${timeString}\n${errorMessage}`
            });
        } catch (settingsError) {
            this.error('Failed to update error settings:', settingsError);
        }
    }

    _formatErrorMessage(error) {
        if (this.isError(error)) {
            return error.stack;
        }

        try {
            return JSON.stringify(error, null, '  ');
        } catch (stringifyError) {
            this.log('Failed to stringify error object:', stringifyError);
            return 'Unknown error';
        }
    }

    isError(err) {
        return (err && err.stack && err.message);
    }

    async _updateProperty(key, value) {
        // Ignore unknown capabilities
        if (!this.hasCapability(key)) {
            return;
        }

        try {
            const changed = this.isCapabilityValueChanged(key, value);

            // Update capability value
            await this.setCapabilityValue(key, value);

            // Trigger device-specific events only for changed values
            if (changed) {
                await this._handlePropertyTriggers(key, value);
            }
        } catch (error) {
            this.error(`Failed to update property ${key}:`, error);
        }
    }

    async _handlePropertyTriggers(key, value) {
        // Placeholder method for device-specific event triggers
        // Override this method in child classes to implement custom trigger logic
        // Example:
        // if (key === 'some_capability') {
        //     await this.driver.triggerSomeEvent(this, { value });
        // }
    }

    isCapabilityValueChanged(key, value) {
        let oldValue = this.getCapabilityValue(key);
        //If oldValue===null then it is a newly added device, lets not trigger flows on that
        if (oldValue !== null && oldValue != value) {
            return true;
        } else {
            return false;
        }
    }

    async updateStoreValue(key, value) {
        try {
            await this.setStoreValue(key, value);
        } catch (error) {
            this.error(`Failed to update store value '${key}' with value '${value}'`, error);
        }
    }

    async updateSetting(key, value) {
        let obj = {};
        obj[key] = String(value);
        try {
            await this.setSettings(obj);
        } catch (error) {
            this.error(`Failed to update setting '${key}' with value '${value}'`, error);
        }
    }

    async updateSettingIfChanged(key, newValue, oldValue) {
        if (newValue != oldValue) {
            await this.updateSetting(key, newValue);
        }
    }

    async updateNumericSettingIfChanged(key, newValue, oldValue, suffix) {
        if (!isNaN(newValue)) {
            await this.updateSettingIfChanged(key, `${newValue}${suffix}`, `${oldValue}${suffix}`);
        }
    }

    logMessage(message) {
        this.log(`[${this.getName()}] ${message}`);
    }

    async addCapabilityHelper(capability) {
        if (!this.hasCapability(capability)) {
            try {
                this.logMessage(`Adding missing capability '${capability}'`);
                await this.addCapability(capability);
            } catch (reason) {
                this.error(`Failed to add capability '${capability}'`);
                this.error(reason);
            }
        }
    }

    async removeCapabilityHelper(capability) {
        if (this.hasCapability(capability)) {
            try {
                this.logMessage(`Remove existing capability '${capability}'`);
                await this.removeCapability(capability);
            } catch (reason) {
                this.error(`Failed to removed capability '${capability}'`);
                this.error(reason);
            }
        }
    }

    async updateCapabilityOptions(capability, options) {
        if (this.hasCapability(capability)) {
            try {
                this.logMessage(`Updating capability options '${capability}'`);
                await this.setCapabilityOptions(capability, options);
            } catch (reason) {
                this.error(`Failed to update capability options for '${capability}'`);
                this.error(reason);
            }
        }
    }

    fetchCapabilityOptions(capability) {
        let options = {};
        if (this.hasCapability(capability)) {
            try {
                //this.logMessage(`Trying to fetch capability options for '${capability}'`);
                options = this.getCapabilityOptions(capability);
            } catch (reason) {
                this.error(`Failed to fetch capability options for '${capability}', even if it exists!!!`);
                this.error(reason);
            }
        }
        return options;
    }

    createFriendlyErrorMsg(reason, baseMsg) {
        let errMsg = baseMsg;
        const errorMsg = reason.message || '';
        
        // Check if error object has structured error information
        let errorCodeName = null;
        if (reason.errors && typeof reason.errors === 'object') {
            errorCodeName = reason.errors.errorCodeName || reason.errors.title;
        }
        
        // Try to extract errorCodeName from JSON string in message
        if (!errorCodeName) {
            const jsonMatch = errorMsg.match(/errorCodeName["\s:]+"([^"]+)"/);
            if (jsonMatch && jsonMatch[1]) {
                errorCodeName = jsonMatch[1];
            }
        }
        
        // Handle specific error cases
        if (errorMsg.indexOf('Access token') > -1) {
            errMsg = 'Access token expired';
        } else if (errorMsg.indexOf('Rate limit') > -1) {
            errMsg = 'The Easee Cloud API rejected the call due to a rate limit';
        } else if (errorCodeName === 'ChargerDisconnected' || errorMsg.indexOf('ChargerDisconnected') > -1) {
            errMsg = 'Charger is disconnected. Please check the charger connection and try again.';
        } else if (errorMsg.indexOf('timed out') > -1 || errorMsg.indexOf('timeout') > -1 || errorMsg.indexOf('aborted due to timeout') > -1) {
            // Check if it's a timeout during command status check
            if (errorMsg.indexOf('command status') > -1) {
                errMsg = 'Charger did not respond in time. The charger may be offline or busy. Please try again.';
            } else {
                errMsg = 'Request timed out. Please check your internet connection and try again.';
            }
        } else if (errorMsg.indexOf('Fallback') > -1) {
            // Extract the most relevant error from the fallback message
            // Try to find ChargerDisconnected or timeout first
            if (errorCodeName === 'ChargerDisconnected' || errorMsg.indexOf('ChargerDisconnected') > -1) {
                errMsg = 'Charger is disconnected. Please check the charger connection and try again.';
            } else if (errorMsg.indexOf('timed out') > -1 || errorMsg.indexOf('timeout') > -1) {
                errMsg = 'Charger did not respond in time. The charger may be offline or busy. Please try again.';
            } else {
                // Extract the last error (fallback error) as it's usually more relevant
                const fallbackMatch = errorMsg.match(/Fallback.*?failed:\s*(.+?)(?:\.|$)/);
                if (fallbackMatch && fallbackMatch[1]) {
                    const fallbackError = fallbackMatch[1].trim();
                    // Check for ChargerDisconnected in fallback error
                    if (fallbackError.indexOf('ChargerDisconnected') > -1) {
                        errMsg = 'Charger is disconnected. Please check the charger connection and try again.';
                    } else if (fallbackError.indexOf('400') > -1) {
                        errMsg = 'Charger rejected the command. Please check the charger status and try again.';
                    } else {
                        // Clean up technical details
                        const cleanError = fallbackError
                            .replace(/post\s+'[^']+':\s*/gi, '')
                            .replace(/Failed\s*\(\d+\)\.\s*/gi, '')
                            .trim();
                        if (cleanError && cleanError.length < 100) {
                            errMsg = `${baseMsg} ${cleanError}`;
                        } else {
                            errMsg = `${baseMsg} Please check the charger connection and try again.`;
                        }
                    }
                } else {
                    errMsg = `${baseMsg} Please check the charger connection and try again.`;
                }
            }
        } else {
            // For other errors, try to extract meaningful information
            // Remove technical details like HTTP status codes and JSON
            let cleanMsg = errorMsg
                .replace(/post\s+'[^']+':\s*/gi, '')
                .replace(/Failed\s*\(\d+\)\.\s*/gi, '')
                .replace(/Errors:\s*\{[^}]+\}/gi, '')
                .replace(/errorCode:\d+/gi, '')
                .replace(/errorCodeName:"[^"]+"/gi, '')
                .trim();
            
            if (cleanMsg && cleanMsg.length > 0 && cleanMsg.length < 200) {
                errMsg = `${baseMsg} ${cleanMsg}`;
            } else {
                errMsg = `${baseMsg} Please check the charger connection and try again.`;
            }
        }

        return errMsg;
    }

    isInt(value) {
        return !isNaN(value) && (function (x) { return (x | 0) === x; })(parseFloat(value))
    }
}
module.exports = BaseDevice;
