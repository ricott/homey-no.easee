'use strict';

const conditionList = [
    { id: 'string.contains', name: 'Contains' },
    { id: 'string.equals', name: 'Equals' },
    { id: 'number.equals', name: 'Equals' },
    { id: 'string.above', name: 'Above (alphabetic)' },
    { id: 'string.below', name: 'Below (alphabetic)' },
    { id: 'number.above', name: 'Above' },
    { id: 'number.below', name: 'Below' }
];

exports.getNumberConditions = function () {
    return getConditions('number');
}
exports.getStringConditions = function () {
    return getConditions('string');
}

exports.evaluateNumericCondition = function (conditionType, conditionValue, value) {

    if (isNaN(conditionValue)) {
        return false;
    }

    let isNull = value === null || value === undefined;
    let result = false;
    switch (conditionType) {
        case 'number.equals':
            result = !isNull && value == conditionValue;
            break;
        case 'number.above':
            result = !isNull && value > conditionValue;
            break;
        case 'number.below':
            result = !isNull && value < conditionValue;
            break;
    }
    return result;
}

function getConditions(type) {
    let conditions = [];
    conditionList.forEach(function (condition) {
        if (condition.id.startsWith(type)) {
            conditions.push(condition);
        }
    });

    return conditions;
}