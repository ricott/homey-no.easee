'use strict';
/*
const Stats = require('../lib/stats.js');

const stats = new Stats();

stats.countError('/hej', '502');
stats.countInvocation('/hej');
stats.countError('/hej', '504');
stats.countInvocation('/hej');
stats.countError('/hej', '502');

console.log(stats.getTotalInvocations());
console.log(stats.getInvocationStats());
console.log(stats.getErrorStats());
console.log(stats.getErrorList());
console.log(stats.getInvocationList());
console.log(stats.getInitDatetime('Europe/Stockholm'));
*/

console.log(resolvePath('/api/commands/EH1212121/2/1243134234243'));

function resolvePath(path) {
    const commandPath = '/api/commands/';
    let fixedPath = path;
    if (path.startsWith(commandPath)) {
        const endPos = path.substring(commandPath.length).indexOf('/') + 1;
        fixedPath = path.substring(0, commandPath.length + endPos);
        fixedPath = fixedPath + '...'
    }

    return fixedPath;
}