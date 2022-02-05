'use strict';
//Docs
//https://www.notion.so/Enumerations-c7fed34ae1ce4d7384d522868f5a0139

exports.deviceTypes = function () {
    return Object.freeze({
        CHARGER: 'charger',
        EQUALIZER: 'equalizer'
    });
}

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

// GridType - equalizer
exports.decodeGridType = function (numType) {
    switch (numType) {
        case 0: return 'UNKNOWN'; break;
        case 1: return 'TN'; break;
        case 2: return 'IT'; break;
        default: return `UNKNOWN (${numType})`; break;
    }
}

// PowerGridType - detectedPowerGridType
exports.decodePowerGridType = function (numType) {
    switch (numType) {
        case 0: return 'NOT_YET_DETECTED'; break;
        case 1: return 'TN_3_PHASE'; break;
        case 2: return 'TN_2_PHASE_PIN_2_3_4'; break;
        case 3: return 'TN_1_PHASE'; break;
        case 4: return 'IT_3_PHASE'; break;
        case 5: return 'IT_1_PHASE'; break;
        // warning, wiring seems to be wrong, but charger is operational
        case 30: return 'WARNING_TN_2_PHASE_PIN_2_3_5'; break;
        case 31: return 'WARNING_TN_1_PHASE_NEUTRAL_ON_PIN_3'; break;
        // error states, will not work
        case 50: return 'ERROR_NO_VALID_POWER_GRID_FOUND'; break;
        case 51: return 'ERROR_TN_400_V_NEUTRAL_ON_WRONG_PIN'; break;
        case 52: return 'ERROR_IT_GND_CONNECTED_TO_PIN_2_OR_3'; break;
        default: return `UNKNOWN (${numType})`; break;
    }
}

exports.decodeOfflineChargingModeType = function (numType) {
    switch (numType) {
        // Always allow charging if offline.
        case 0: return 'Always'; break;
        // Only allow charging if token is whitelisted in the local token cache.
        case 1: return 'If whitelisted'; break;
        // Never allow charging if offline.
        case 2: return 'Never'; break;
        default: return `UNKNOWN (${numType})`; break;
    }
}

exports.decodeReasonForNoCurrent = function (numType) {
    switch (numType) {
        // charger is allocated current
        case 0: return 'OK'; break;
        case 1: return 'MaxCircuitCurrentTooLow'; break;
        case 2: return 'MaxDynamicCircuitCurrentTooLow'; break;
        case 3: return 'MaxDynamicOfflineFallbackCircuitCurrentTooLow'; break;
        case 4: return 'CircuitFuseTooLow'; break;
        case 5: return 'WaitingInQueue'; break;
        // charged queue (charger assumes one of: EV uses delayed charging, EV charging complete)
        case 6: return 'WaitingInFully'; break;
        case 7: return 'IllegalGridType'; break;
        case 8: return 'PrimaryUnitHasNotReceivedCurrentRequestFromSecondaryUnit'; break;
        // no car connected...
        case 50: return 'SecondaryUnitNotRequestingCurrent'; break;
        case 51: return 'MaxChargerCurrentTooLow'; break;
        case 52: return 'MaxDynamicChargerCurrentTooLow'; break;
        case 53: return 'ChargerDisabled'; break;
        case 54: return 'PendingScheduledCharging'; break;
        case 55: return 'PendingAuthorization'; break;
        case 56: return 'ChargerInErrorState'; break;
        case 100: return 'Undefined'; break;
        default: return `UNKNOWN (${numType})`; break;
    }
}

exports.decodeEqualizerCommandResponse = function (observationId) {
    switch (observationId) {
        case 1: return 'Reboot'; break;
        case 2: return 'PollSingle'; break;
        case 3: return 'PollAll'; break;
        case 4: return 'UpgradeFirmware'; break;
        case 5: return 'DownloadSettings'; break;
        case 6: return 'SetFirmware'; break;
        case 7: return 'HanSnapshot'; break;
        case 8: return 'SetCircuitPhaseMapping'; break;
        case 9: return 'DeviceMode'; break;
        case 10: return 'ModbusConfiguration'; break;
        case 11: return 'ClearCircuitPhaseMapping'; break;
        case 12: return 'ModbusGPIConfiguration'; break;
        case 13: return 'ModbusLevelConfiguration'; break;
        case 14: return 'SendEaseeLinkCommand'; break;
        case 15: return 'ConfigureFuse'; break;
        case 16: return 'AddChild'; break;
        case 17: return 'ClearChild'; break;
        case 18: return 'ClearAllChildren'; break;
        default: return `UNKNOWN (${observationId})`; break;
    }
}

exports.decodeChargerCommandResponse = function (observationId) {
    switch (observationId) {
        case 1: return 'Reboot'; break;
        case 2: return 'PollSingle'; break;
        case 3: return 'PollAll'; break;
        case 4: return 'UpgradeFirmware'; break;
        case 5: return 'DownloadSettings'; break;
        case 6: return 'SetFirmware'; break;
        case 11: return 'SetSmartCharging'; break;
        case 21: return 'SetDynamicCurrentOfflineFallback'; break;
        case 22: return 'SetDynamicCircuitCurrent'; break;
        case 23: return 'AbortCharging'; break;
        case 24: return 'SetMaxCircuitCurrent'; break;
        case 25: return 'AuthorizeCharging'; break;
        case 26: return 'DeauthorizeCharging'; break;
        case 29: return 'SetEnabled'; break;
        case 30: return 'SetLockCablePermanently'; break;
        case 33: return 'SetLocalAuthorizationRequired'; break;
        case 34: return 'EnableIdleCurrent'; break;
        case 38: return 'SetPhaseMode'; break;
        case 40: return 'SetLedStripBrightness'; break;
        case 47: return 'SetMaxChargerCurrent'; break;
        case 48: return 'SetDynamicChargerCurrent'; break;
        case 50: return 'SetCircuitRatedCurrent'; break;
        case 60: return 'AddSchedule'; break;
        case 61: return 'ClearSchedule'; break;
        case 62: return 'GetSchedule'; break;
        case 63: return 'OverrideSchedule'; break;
        case 64: return 'PurgeSchedule'; break;
        default: return `UNKNOWN (${observationId})`; break;
    }
}

exports.decodeChargerObservation = function (observationId) {
    switch (observationId) {
        // PASSED or error codes [String]
        case 1: return 'SelfTestResult'; break;
        // JSON with details from self-test [String]
        case 2: return 'SelfTestDetails'; break;
        // Enum with WiFi event codes. Requires telemetry debug mode. Will be updated on WiFi events when using cellular,  will otherwise be reported in ChargerOfflineReason [Integer]
        case 10: return 'WifiEvent'; break;
        // Enum describing why charger is offline [Integer]
        case 11: return 'ChargerOfflineReason'; break;
        // Response on a EaseeLink command sent to another devic [Integer]
        case 13: return 'EaseeLinkCommandResponse'; break;
        // Data received on EaseeLink from another device [String]
        case 14: return 'EaseeLinkDataReceived'; break;
        // Preauthorize with whitelist enabled. Readback on setting [event] [Boolean]
        case 15: return 'LocalPreAuthorizeEnabled'; break;
        // Allow offline charging for whitelisted RFID token. Readback on setting [event] [Boolean]
        case 16: return 'LocalAuthorizeOfflineEnabled'; break;
        // Allow offline charging for all RFID tokens. Readback on setting [event] [Boolean]
        case 17: return 'AllowOfflineTxForUnknownId'; break;
        // 0 == erratic checking disabled, otherwise the number of toggles between states Charging and Charging Complate that will trigger an error [Integer]
        case 18: return 'ErraticEVMaxToggles'; break;
        // Readback on backplate type [Integer]
        case 19: return 'BackplateType'; break;
        // Site Structure [boot] [String]
        case 20: return 'SiteStructure'; break;
        // Detected power grid type according to PowerGridType table [boot] [Integer]
        case 21: return 'DetectedPowerGridType'; break;
        // Set circuit maximum current [Amperes] [Double]
        case 22: return 'CircuitMaxCurrentP1'; break;
        // Set circuit maximum current [Amperes] [Double]
        case 23: return 'CircuitMaxCurrentP2'; break;
        // Set circuit maximum current [Amperes] [Double]
        case 24: return 'CircuitMaxCurrentP3'; break;
        // Location coordinate [event] [Position]
        case 25: return 'Location'; break;
        // Site ID string [event] [String]
        case 26: return 'SiteIDString'; break;
        // Site ID numeric value [event] [Integer]
        case 27: return 'SiteIDNumeric'; break;
        // Lock type2 cable permanently [Boolean]
        case 30: return 'LockCablePermanently'; break;
        // Set true to enable charger, false disables charger [Boolean]
        case 31: return 'IsEnabled'; break;
        // Charger sequence number on circuit [Integer]
        case 33: return 'CircuitSequenceNumber'; break;
        // Phase to use in 1-phase charging [Integer]
        case 34: return 'SinglePhaseNumber'; break;
        // Allow charging using 3-phases [Boolean]
        case 35: return 'Enable3Phases_DEPRECATED'; break;
        // WiFi SSID name [String]
        case 36: return 'WiFiSSID'; break;
        // Charger signals available current when EV is done charging [user option] [event] [Boolean]
        case 37: return 'EnableIdleCurrent'; break;
        // Phase mode on this charger. 1-Locked to 1-Phase, 2-Auto, 3-Locked to 3-phase(only Home) [Integer]
        case 38: return 'PhaseMode'; break;
        // Default disabled. Must be set manually if grid type is indeed three phase IT [Boolean]
        case 39: return 'ForcedThreePhaseOnITWithGndFault'; break;
        // LED strip brightness, 0-100% [Integer]
        case 40: return 'LedStripBrightness'; break;
        // Local RFID authorization is required for charging [user options] [event] [Boolean]
        case 41: return 'LocalAuthorizationRequired'; break;
        // Authorization is requried for charging [Boolean]
        case 42: return 'AuthorizationRequired'; break;
        // Remote start required flag [event] [Boolean]
        case 43: return 'RemoteStartRequired'; break;
        // Smart button is enabled [Boolean]
        case 44: return 'SmartButtonEnabled'; break;
        // Charger behavior when offline [Integer]
        case 45: return 'OfflineChargingMode'; break;
        // Charger LED mode [event] [Integer]
        case 46: return 'LEDMode'; break;
        // Max current this charger is allowed to offer to car (A). Non volatile. [Double]
        case 47: return 'MaxChargerCurrent'; break;
        // Max current this charger is allowed to offer to car (A). Volatile [Double]
        case 48: return 'DynamicChargerCurrent'; break;
        // Maximum circuit current P1 when offline [event] [Integer]
        case 50: return 'MaxCurrentOfflineFallback_P1'; break;
        // Maximum circuit current P2 when offline [event] [Integer]
        case 51: return 'MaxCurrentOfflineFallback_P2'; break;
        // Maximum circuit current P3 when offline [event] [Integer]
        case 52: return 'MaxCurrentOfflineFallback_P3'; break;
        // Charging schedule [json] [String]
        case 62: return 'ChargingSchedule'; break;
        // Paired equalizer details [String]
        case 65: return 'PairedEqualizer'; break;
        // True if WiFi Access Point is enabled, otherwise false [Boolean]
        case 68: return 'WiFiAPEnabled'; break;
        // Observed user token when charger put in RFID pairing mode [event] [String]
        case 69: return 'PairedUserIDToken'; break;
        // Total current allocated to L1 by all chargers on the circuit. Sent in by master only [Double]
        case 70: return 'CircuitTotalAllocatedPhaseConductorCurrent_L1'; break;
        // Total current allocated to L2 by all chargers on the circuit. Sent in by master only [Double]
        case 71: return 'CircuitTotalAllocatedPhaseConductorCurrent_L2'; break;
        // Total current allocated to L3 by all chargers on the circuit. Sent in by master only [Double]
        case 72: return 'CircuitTotalAllocatedPhaseConductorCurrent_L3'; break;
        // Total current in L1 (sum of all chargers on the circuit) Sent in by master only [Double]
        case 73: return 'CircuitTotalPhaseConductorCurrent_L1'; break;
        // Total current in L2 (sum of all chargers on the circuit) Sent in by master only [Double]
        case 74: return 'CircuitTotalPhaseConductorCurrent_L2'; break;
        // Total current in L3 (sum of all chargers on the circuit) Sent in by master only [Double]
        case 75: return 'CircuitTotalPhaseConductorCurrent_L3'; break;
        // Number of cars connected to this circuit [Integer]
        case 76: return 'NumberOfCarsConnected'; break;
        // Number of cars currently charging [Integer]
        case 77: return 'NumberOfCarsCharging'; break;
        // Number of cars currently in queue, waiting to be allocated power [Integer]
        case 78: return 'NumberOfCarsInQueue'; break;
        // Number of cars that appear to be fully charged [Integer]
        case 79: return 'NumberOfCarsFullyCharged'; break;
        // Embedded software package release id [boot] [Integer]
        case 80: return 'SoftwareRelease'; break;
        // SIM integrated circuit card identifier [String]
        case 81: return 'ICCID'; break;
        // Modem firmware version [String]
        case 82: return 'ModemFwId'; break;
        // OTA error code, see table [event] [Integer]
        case 83: return 'OTAErrorCode'; break;
        // Current mobile network operator [pollable] [String]
        case 84: return 'MobileNetworkOperator'; break;
        // Reason of reboot. Bitmask of flags. [Integer]
        case 89: return 'RebootReason'; break;
        // Power PCB hardware version [Integer]
        case 90: return 'PowerPCBVersion'; break;
        // Communication PCB hardware version [Integer]
        case 91: return 'ComPCBVersion'; break;
        // Enum describing why a charger with a car connected is not offering current to the car [Integer]
        case 96: return 'ReasonForNoCurrent'; break;
        // Number of connected chargers in the load balancin. Including the master. Sent from Master only. [Integer]
        case 97: return 'LoadBalancingNumberOfConnectedChargers'; break;
        // Number of chargers connected to master through UDP / WIFI [Integer]
        case 98: return 'UDPNumOfConnectedNodes'; break;
        // Slaves only. Current connection to master, 0 = None, 1= Radio, 2 = WIFI UDP, 3 = Radio and WIFI UDP [Integer]
        case 99: return 'LocalConnection'; break;
        // Pilot Mode Letter (A-F) [event] [String]
        case 100: return 'PilotMode'; break;
        // Car connection state [Boolean]
        case 101: return 'CarConnected_DEPRECATED'; break;
        // Smart charging state enabled by capacitive touch button [event] [Boolean]
        case 102: return 'SmartCharging'; break;
        // Cable lock state [event] [Boolean]
        case 103: return 'CableLocked'; break;
        // Cable rating read [Amperes] [event] [Double]
        case 104: return 'CableRating'; break;
        // Pilot signal high [Volt] [debug] [Double]
        case 105: return 'PilotHigh'; break;
        // Pilot signal low [Volt] [debug] [Double]
        case 106: return 'PilotLow'; break;
        // Back Plate RFID of charger [boot] [String]
        case 107: return 'BackPlateID'; break;
        // User ID token string from RFID reading [event] (NB! Must reverse these strings) [String]
        case 108: return 'UserIDTokenReversed'; break;
        // Charger operation mode according to charger mode table [event] [Integer]
        case 109: return 'ChargerOpMode'; break;
        // Active output phase(s) to EV according to output phase type table. [event] [Integer]
        case 110: return 'OutputPhase'; break;
        // Dynamically set circuit maximum current for phase 1 [Amperes] [event] [Double]
        case 111: return 'DynamicCircuitCurrentP1'; break;
        // Dynamically set circuit maximum current for phase 2 [Amperes] [event] [Double]
        case 112: return 'DynamicCircuitCurrentP2'; break;
        // Dynamically set circuit maximum current for phase 3 [Amperes] [event] [Double]
        case 113: return 'DynamicCircuitCurrentP3'; break;
        // Available current signaled to car with pilot tone [Double]
        case 114: return 'OutputCurrent'; break;
        // Available current after derating [A] [Double]
        case 115: return 'DeratedCurrent'; break;
        // Available current is limited by the charger due to high temperature [event] [Boolean]
        case 116: return 'DeratingActive'; break;
        // Debug string [String]
        case 117: return 'DebugString'; break;
        // Descriptive error string [event] [String]
        case 118: return 'ErrorString'; break;
        // Error code according to error code table [event] [Integer]
        case 119: return 'ErrorCode'; break;
        // Total power [kW] [telemetry] [Double]
        case 120: return 'TotalPower'; break;
        // Session accumulated energy [kWh] [telemetry] [Double]
        case 121: return 'SessionEnergy'; break;
        // Accumulated energy per hour [kWh] [event] [Double]
        case 122: return 'EnergyPerHour'; break;
        // 0 = not legacy ev, 1 = legacy ev detected, 2 = reviving ev [Integer]
        case 123: return 'LegacyEvStatus'; break;
        // Accumulated energy in the lifetime of the charger [kWh] [Double]
        case 124: return 'LifetimeEnergy'; break;
        // Total number of relay switches in the lifetime of the charger (irrespective of the number of phases used) [Integer]
        case 125: return 'LifetimeRelaySwitches'; break;
        // Total number of hours in operation [Integer]
        case 126: return 'LifetimeHours'; break;
        // Maximum circuit current when offline [event] [Integer]
        case 127: return 'DynamicCurrentOfflineFallback_DEPRICATED'; break;
        // User ID token string from RFID reading [event] [String]
        case 128: return 'UserIDToken'; break;
        // Charging sessions [json] [event] [String]
        case 129: return 'ChargingSession'; break;
        // Cellular signal strength [dBm] [telemetry] [Integer]
        case 130: return 'CellRSSI'; break;
        // Cellular radio access technology according to RAT table [event] [Integer]
        case 131: return 'CellRAT'; break;
        // WiFi signal strength [dBm] [telemetry] [Integer]
        case 132: return 'WiFiRSSI'; break;
        // IP address assigned by cellular network [debug] [String]
        case 133: return 'CellAddress'; break;
        // IP address assigned by WiFi network [debug] [String]
        case 134: return 'WiFiAddress'; break;
        // WiFi network type letters (G, N, AC, etc) [debug] [String]
        case 135: return 'WiFiType'; break;
        // Local radio signal strength [dBm] [telemetry] [Integer]
        case 136: return 'LocalRSSI'; break;
        // Back Plate RFID of master [event] [String]
        case 137: return 'MasterBackPlateID'; break;
        // Local radio transmission power [dBm] [telemetry] [Integer]
        case 138: return 'LocalTxPower'; break;
        // Local radio state [event] [String]
        case 139: return 'LocalState'; break;
        // List of found WiFi SSID and RSSI values [event] [String]
        case 140: return 'FoundWiFi'; break;
        // Radio access technology in use: 0 = cellular, 1 = wifi [Integer]
        case 141: return 'ChargerRAT'; break;
        // The number of times since boot the system has reported an error on this interface [poll] [Integer]
        case 142: return 'CellularInterfaceErrorCount'; break;
        // The number of times since boot the interface was reset due to high error count [poll] [Integer]
        case 143: return 'CellularInterfaceResetCount'; break;
        // The number of times since boot the system has reported an error on this interface [poll] [Integer]
        case 144: return 'WifiInterfaceErrorCount'; break;
        // The number of times since boot the interface was reset due to high error count [poll] [Integer]
        case 145: return 'WifiInterfaceResetCount'; break;
        // 0-Unconfigured, 1-Master, 2-Extender, 3-End device [Integer]
        case 146: return 'LocalNodeType'; break;
        // Channel nr 0 - 11 [Integer]
        case 147: return 'LocalRadioChannel'; break;
        // Address of charger on local radio network [Integer]
        case 148: return 'LocalShortAddress'; break;
        // If master-Number of slaves connected, If slave- Address parent [Integer]
        case 149: return 'LocalParentAddrOrNumOfNodes'; break;
        // Maximum temperature for all sensors [Celsius] [telemetry] [Double]
        case 150: return 'TempMax'; break;
        // Temperature measured by ambient sensor on power board [Celsius] [event] [Double]
        case 151: return 'TempAmbientPowerBoard'; break;
        // Temperature at input T2 [Celsius] [event] [Double]
        case 152: return 'TempInputT2'; break;
        // Temperature at input T3 [Celsius] [event] [Double]
        case 153: return 'TempInputT3'; break;
        // Temperature at input T4 [Celsius] [event] [Double]
        case 154: return 'TempInputT4'; break;
        // Temperature at input T5 [Celsius] [event] [Double]
        case 155: return 'TempInputT5'; break;
        // Temperature at type 2 connector plug for N [Celsius] [event] [Double]
        case 160: return 'TempOutputN'; break;
        // Temperature at type 2 connector plug for L1 [Celsius] [event] [Double]
        case 161: return 'TempOutputL1'; break;
        // Temperature at type 2 connector plug for L2 [Celsius] [event] [Double]
        case 162: return 'TempOutputL2'; break;
        // Temperature at type 2 connector plug for L3 [Celsius] [event] [Double]
        case 163: return 'TempOutputL3'; break;
        // Ambient temperature [Celsius] [event] [Double]
        case 170: return 'TempAmbient'; break;
        // Ambient light from front side [Percent] [debug] [Integer]
        case 171: return 'LightAmbient'; break;
        // Internal relative humidity [Percent] [event] [Integer]
        case 172: return 'IntRelHumidity'; break;
        // Back plate confirmed locked [event] [Boolean]
        case 173: return 'BackPlateLocked'; break;
        // Motor current draw [debug] [Double]
        case 174: return 'CurrentMotor'; break;
        // Raw sensor value [mV] [Integer]
        case 175: return 'BackPlateHallSensor'; break;
        // Calculated current RMS for input T2 [Amperes] [telemetry] [Double]
        case 182: return 'InCurrent_T2'; break;
        // Current RMS for input T3 [Amperes] [telemetry] [Double]
        case 183: return 'InCurrent_T3'; break;
        // Current RMS for input T4 [Amperes] [telemetry] [Double]
        case 184: return 'InCurrent_T4'; break;
        // Current RMS for input T5 [Amperes] [telemetry] [Double]
        case 185: return 'InCurrent_T5'; break;
        // Input voltage RMS between T1 and T2 [Volt] [telemetry] [Double]
        case 190: return 'InVolt_T1_T2'; break;
        // Input voltage RMS between T1 and T3 [Volt] [telemetry] [Double]
        case 191: return 'InVolt_T1_T3'; break;
        // Input voltage RMS between T1 and T4 [Volt] [telemetry] [Double]
        case 192: return 'InVolt_T1_T4'; break;
        // Input voltage RMS between T1 and T5 [Volt] [telemetry] [Double]
        case 193: return 'InVolt_T1_T5'; break;
        // Input voltage RMS between T2 and T3 [Volt] [telemetry] [Double]
        case 194: return 'InVolt_T2_T3'; break;
        // Input voltage RMS between T2 and T4 [Volt] [telemetry] [Double]
        case 195: return 'InVolt_T2_T4'; break;
        // Input voltage RMS between T2 and T5 [Volt] [telemetry] [Double]
        case 196: return 'InVolt_T2_T5'; break;
        // Input voltage RMS between T3 and T4 [Volt] [telemetry] [Double]
        case 197: return 'InVolt_T3_T4'; break;
        // Input voltage RMS between T3 and T5 [Volt] [telemetry] [Double]
        case 198: return 'InVolt_T3_T5'; break;
        // Input voltage RMS between T4 and T5 [Volt] [telemetry] [Double]
        case 199: return 'InVolt_T4_T5'; break;
        // Output voltage RMS between type 2 pin 1 and 2 [Volt] [telemetry] [Double]
        case 202: return 'OutVoltPin1_2'; break;
        // Output voltage RMS between type 2 pin 1 and 3 [Volt] [telemetry] [Double]
        case 203: return 'OutVoltPin1_3'; break;
        // Output voltage RMS between type 2 pin 1 and 4 [Volt] [telemetry] [Double]
        case 204: return 'OutVoltPin1_4'; break;
        // Output voltage RMS between type 2 pin 1 and 5 [Volt] [telemetry] [Double]
        case 205: return 'OutVoltPin1_5'; break;
        // 3.3 Volt Level [Volt] [telemetry] [Double]
        case 210: return 'VoltLevel33'; break;
        // 5 Volt Level [Volt] [telemetry] [Double]
        case 211: return 'VoltLevel5'; break;
        // 12 Volt Level [Volt] [telemetry] [Double]
        case 212: return 'VoltLevel12'; break;
        // Reference Signal Received Power (LTE) [-144 .. -44 dBm] [Integer]
        case 220: return 'LTE_RSRP'; break;
        // Signal to Interference plus Noise Ratio (LTE) [-20 .. +30 dB] [Integer]
        case 221: return 'LTE_SINR'; break;
        // Reference Signal Received Quality (LTE) [-19 .. -3 dB] [Integer]
        case 222: return 'LTE_RSRQ'; break;
        // Available current for charging on P1 according to Equalizer [Double]
        case 230: return 'EqAvailableCurrentP1'; break;
        // Available current for charging on P2 according to Equalizer [Double]
        case 231: return 'EqAvailableCurrentP2'; break;
        // Available current for charging on P3 according to Equalizer [Double]
        case 232: return 'EqAvailableCurrentP3'; break;
        // True = charger needs control pulse to consider itself online. Readback on charger setting [event] [Boolean]
        case 56: return 'ListenToControlPulse'; break;
        // Control pulse round-trip time in milliseconds [Integer]
        case 57: return 'ControlPulseRTT'; break;
        default: return `UNKNOWN (${observationId})`; break;
    }
}

exports.decodeEqualizerObservation = function (observationId) {
    switch (observationId) {
        // PASSED or error codes [String]
        case 1: return 'SelfTestResult'; break;
        // JSON with details from self-test [String]
        case 2: return 'SelfTestDetails'; break;
        // Response on a EaseeLink command sent to another devic [Integer]
        case 13: return 'EaseeLinkCommandResponse'; break;
        // Data received on EaseeLink from another device [String]
        case 14: return 'EaseeLinkDataReceived'; break;
        // Site ID numeric value [event] [Integer]
        case 19: return 'SiteIDNumeric'; break;
        // Site Structure [boot] [String]
        case 20: return 'SiteStructure'; break;
        // Embedded software package release id [boot] [Integer]
        case 21: return 'SoftwareRelease'; break;
        // Meter type [String]
        case 25: return 'MeterType'; break;
        // Meter identification [String]
        case 26: return 'MeterID'; break;
        // OBIS List version identifier [String]
        case 27: return 'OBISListIdentifier'; break;
        // 0=Unknown, 1=TN,  2=IT, [Integer]
        case 29: return 'GridType'; break;
        //  [Integer]
        case 30: return 'NumPhases'; break;
        // Current in Amps [Double]
        case 31: return 'Current_L1'; break;
        // Current in Amps [Double]
        case 32: return 'Current_L2'; break;
        // Current in Amps [Double]
        case 33: return 'Current_L3'; break;
        // Voltage in Volts [Double]
        case 34: return 'Voltage_N_L1'; break;
        // Voltage in Volts [Double]
        case 35: return 'Voltage_N_L2'; break;
        // Voltage in Volts [Double]
        case 36: return 'Voltage_N_L3'; break;
        // Voltage in Volts [Double]
        case 37: return 'Voltage_L1_L2'; break;
        // Voltage in Volts [Double]
        case 38: return 'Voltage_L1_L3'; break;
        // Voltage in Volts [Double]
        case 39: return 'Voltage_L2_L3'; break;
        // Active Power Import in kW [Double]
        case 40: return 'ActivePowerImport'; break;
        // Active Power Export in kW [Double]
        case 41: return 'ActivePowerExport'; break;
        // Reactive Power Import in kVAR [Double]
        case 42: return 'ReactivePowerImport'; break;
        // Reactive Power Export in kVAR [Double]
        case 43: return 'ReactivePowerExport'; break;
        // Maximum power import[event] [Double]
        case 44: return 'MaxPowerImport'; break;
        // Cumulative Active Power Import in kWh [Double]
        case 45: return 'CumulativeActivePowerImport'; break;
        // Cumulative Active Power Export in kWh [Double]
        case 46: return 'CumulativeActivePowerExport'; break;
        // Cumulative Reactive Power Import in kVARh [Double]
        case 47: return 'CumulativeReactivePowerImport'; break;
        // Cumulative Reactive Power Export in kVARh [Double]
        case 48: return 'CumulativeReactivePowerExport'; break;
        // Clock and Date from Meter [String]
        case 49: return 'ClockAndDateMeter'; break;
        // Received Channel Power Indicator (dBm) [Double]
        case 50: return 'RCPI'; break;
        // WIFI SSID  [String]
        case 51: return 'SSID'; break;
        // Back Plate RFID of master charger [event] [String]
        case 55: return 'MasterBackPlateID'; break;
        // Back Plate RFID of equalizer [boot] [String]
        case 56: return 'EqualizerID'; break;
        // Exception Debug Information [boot] [String]
        case 60: return 'ExceptionData'; break;
        // (Re)boot reason [boot] [String]
        case 61: return 'BootReason'; break;
        // Number of transitions to high current mode (Debug) [Integer]
        case 64: return 'HighCurrentTransitions'; break;
        // Capacitor Voltage in Volts [Double]
        case 65: return 'VCap'; break;
        // Minimum Bus Voltage in Volts [Double]
        case 66: return 'VBusMin'; break;
        // Maximum Bus Voltage in Volts [Double]
        case 67: return 'VbusMax'; break;
        // Internal temperature in Celsius [Double]
        case 68: return 'InternalTemperature'; break;
        // HAN data snapshot [String]
        case 69: return 'HanSnapshot'; break;
        // Local radio signal strength [dBm] [telemetry] [Integer]
        case 70: return 'LocalRSSI'; break;
        //  Local radio transmission power [dBm] [telemetry] [Integer]
        case 71: return 'LocalTxPower'; break;
        // Local radio channel nr 0 - 11 [telemetry] [Integer]
        case 72: return 'LocalRadioChannel'; break;
        // Address of equalizer on local radio network [telemetry] [Integer]
        case 73: return 'LocalShortAddress'; break;
        // 0-Unconfigured, 1 - Coordinator, 2 - Range extender, 3 - End device, 4- Sleepy end device [telemetry] [Integer]
        case 74: return 'LocalNodeType'; break;
        // Address of parent on local radio network. If 0 - master, else extender [telemetry] [Integer]
        case 75: return 'LocalParentAddress'; break;
        // Mapping between EQ phases and charger phases [String]
        case 80: return 'CircuitPhaseMapping'; break;
        // Charger vs Meter phase correlation report [String]
        case 81: return 'PhaseMappingReport'; break;
        // Complete Modbus Configuration [String]
        case 85: return 'ModbusConfiguration'; break;
        // Throttle level [percent] [Integer]
        case 86: return 'LoadbalanceThrottle'; break;
        // Available Current for Balancing in Amps [Double]
        case 87: return 'AvailableCurrent_L1'; break;
        // Available Current for Balancing in Amps [Double]
        case 88: return 'AvailableCurrent_L2'; break;
        // Available Current for Balancing in Amps [Double]
        case 89: return 'AvailableCurrent_L3'; break;
        // Han Frame Checksum Errors [Integer]
        case 90: return 'HanChecksumErrors'; break;
        // Mac Address of the Wifi access point [String]
        case 91: return 'APMacAddress'; break;
        // Number of sucessful reconnects to AP [Integer]
        case 92: return 'WifiReconnects'; break;
        // Current LED pattern [Integer]
        case 100: return 'LedMode'; break;
        default: return `UNKNOWN (${observationId})`; break;
    }
}
