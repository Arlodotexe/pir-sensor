// scp ./node.js root@192.168.0.203:"'/root/PIR Sensor/node.js'"

'use strict';
const exec = require('child_process').exec;
const hue = require('./hue');
const requestify = require('requestify');
const express = require('express'), app = express();
const bodyParser = require('body-parser');
const http = require('http');
const secret = require('./secret');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

let sunrise, sunset, goldenHour, goldenHourEnd;
let lat = 42.562986, long = -92.499992;

let time;
let room;
let sensorPin = "11";

function init(cb) {
    if (hue.ready) {
        assignRoom();
        exec('gpioctl dirin ' + sensorPin);
        log("Set up pin " + sensorPin);
        log('Connected to Philips Hue Bridge');
        getSunTimes().then(_ => {
            log('Retrieved sun data and timings');
            maintainBrightness();
        });

        hue.light.on('Main ' + room);
        setTimeout(() => {
            hue.light.off('Main ' + room);
            speak(room + ' motion sensor is ready');
        }, 500);
        presence.init();
        if (typeof cb == 'function') cb();
    } else {
        setTimeout(() => {
            init();
        }, 200);
    }
}

function getTime() {
    http.get(secret.mmserverAddress + '/time', function(res) {
        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });

        res.on('end', () => {
            time = JSON.parse(rawData);
        });
    });
}

function getSunTimes() {
    return new Promise(resolve => {
        http.get(secret.mmserverAddress + '/sundata', function(res) {
            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });

            res.on('end', () => {
                let body = JSON.parse(rawData);

                sunset = body.sunset;
                sunrise = body.sunrise;
                goldenHour = body.goldenHour;
                goldenHourEnd = body.goldenHourEnd;
                resolve();
            });
        });
    });
}

setInterval(getTime, 2000);
getSunTimes();

function replaceAll(str, find, replace) {
    'use strict';
    return String.raw`${str}`.replace(new RegExp(find.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1'), 'g'), replace);
}

var _slicedToArray = function() { function sliceIterator(arr, i) { var _arr = []; var _n = !0; var _d = !1; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = !0) { _arr.push(_s.value); if (i && _arr.length === i) break } } catch (err) { _d = !0; _e = err } finally { try { if (!_n && _i["return"]) _i["return"]() } finally { if (_d) throw _e } } return _arr } return function(arr, i) { if (Array.isArray(arr)) { return arr } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i) } else { throw new TypeError("Invalid attempt to destructure non-iterable instance") } } }();
function toMilitaryTime(time12h) {
    var _time12h$split = time12h.split(' '), _time12h$split2 = _slicedToArray(_time12h$split, 2), time = _time12h$split2[0], modifier = _time12h$split2[1]; var _time$split = time, _time$split2 = _slicedToArray(_time$split, 2), hours = _time$split2[0], minutes = _time$split2[1]; if (hours === '12') { hours = '00' }
    if (modifier === 'PM') { hours = parseInt(hours, 10) + 12 }
    return [hours, minutes]
}

function assignRoom() {
    let ip = require('os').networkInterfaces().apcli0[0].address;
    let mac = require('os').networkInterfaces().apcli0[0].mac;

    switch (ip) {
        case '192.168.0.203':
            room = 'Kitchen';
            break;
        case '192.168.0.201':
            room = 'Bathroom';
            break;
        default:
            error('IP Address is not bound to a room: ' + ip + '.\n Hardware ID is: ' + mac.substr(mac.length - 4));
    }
}

const error = function(msg) {
    console.trace(msg);
    requestify.post(secret.mmserverAddress, {
        error: '(silent)' + room + ' motion sensor: ' + msg
    });

    requestify.post(secret.mmserverAddress, {
        speak: '(noheader)(v:Microsoft Eva Mobile) Something went wrong with the ' + room + ' motion sensor: ' + msg
    });
}

const log = function(msg) {
    requestify.post(secret.mmserverAddress, {
        log: room + ' motion sensor: ' + msg
    });
    console.log(msg);
}

function speak(msg) {
    requestify.post(secret.mmserverAddress, {
        say: '(noheader)(v:Microsoft Eva Mobile) ' + msg
    });
}

function isGettingDark() {
    if (time && goldenHour && (time[0] > goldenHour[0] && time[1] > goldenHour[1]) && !isAfterSunset()) return true;
    else return false;
}
function isGettingLight() {
    if (time && goldenHourEnd && (time[0] > goldenHourEnd[0] && time[1] > goldenHourEnd[1]) && !isAfterSunrise()) return true;
    else return false;
}
function isAfterSunset() {
    if (time && sunset && (time[0] > sunset[0] && time[0] < sunrise[0])) return true;
    else return false;
}
function isAfterSunrise() {
    if (time && sunrise && (time[0] > sunrise[0] && time[0] < sunset[0])) return true;
    else return false;
}

function blink(times) {
    hue.light.off('Main ' + room);
    setTimeout(() => {
        hue.light.on('Main ' + room);
    }, 500);

    if (time > 1) {
        blink(times - 1);
    }
}

function debounce(func, wait, immediate) {
    var timeout;
    return function() {
        var context = this, args = arguments;
        var later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        var callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
};

function maintainBrightness() {
    // Intermediate brightness when it's getting dark outside
    if ((isAfterSunrise() && isGettingDark() && !isAfterSunset()) && (room !== 'Bathroom')) hue.light.brightness('Main ' + room, 75);

    // Don't turn on the lights (Outside the bathroom) if it's the middle of the day
    /* if ((isAfterSunrise() && !isGettingDark() && !isAfterSunset()) && (room !== 'Bathroom')) delaying = true; */

    // If it's past 2AM, dim the lights a lot so you don't burn your eyes out using the bathroom or getting a snack
    if ((isAfterSunset() && !isGettingLight() && (time && toMilitaryTime(time)[0] > 2))) {
        hue.light.brightness('Main ' + room, 25);
    }

    // But if it's not yet passed 2AM, keep the lights bright. Someone might still be awake and using them.
    else if ((isAfterSunset() && !isGettingLight())) {
        hue.light.brightness('Main ' + room, 75);
    }

    // It's almost morning, intermediate brightness
    if ((isAfterSunset() && isGettingLight() && !isAfterSunrise())) hue.light.brightness('Main ' + room, 50);
}

function isOnline() {
    return new Promise(resolve => {
        debounce(exec('ping -c 1 1.1.1.1', (err, stdout) => {
            if (err) error(err);
            if (stdout.includes('0% packet loss')) {
                resolve(true);
            } else {
                log('Device has gone offline. Restarting network server...');
                debounce(exec('service network restart', () => {
                    setTimeout(() => {
                        isOnline().then(result => {
                            if (!result) {
                                log('Restarting network service didn\'t work. Forcing a reboot');
                                exec('reboot -f');
                            }
                        });
                    }, 2000);
                }), 5000);
            }
        }), 5000);
    });
}

function hasPresence() {
    if (hue.ready) return new Promise(resolve => {
        exec('gpioctl get 11', (err, stdout) => {
            if (err) error(err);
            if (stdout.includes('HIGH')) {
                resolve(true)
            }
            if (stdout.includes('LOW')) {
                resolve(false);
            }
        });
    });
}

function recursivePresenceCheck() {
    hasPresence()
        .then(isPresent => {
            if (!isPresent) {
                if (presence.lastPowerState) {
                    hue.light.off("Main " + room);
                    presence.lastPowerState = false;
                }
                return;
            }


            // isPresent must be true to get here
            if (!presence.lastPowerState) {
                hue.light.on('Main ' + room);
                presence.lastPowerState = true;
            }

            switch (room) {
                case "Kitchen":
                    presence.delay(presence.recentlyDelayed ? 30 : 10);
                    break;
                case "Bathroom":
                    presence.delay(presence.recentlyDelayed ? 30 : 10);
                    break;
                default:
                    error("Invalid light room name while checking light presence " + room);
            }
        });
}

let presence = {
    checkTick: undefined,
    lastPowerState: false,
    init: function(intervalMS) {
        if (hue.ready) {
            presence.checkTick = setInterval(recursivePresenceCheck, intervalMS ? intervalMS : 1000);
        }
    },
    cancel: function() {
        clearInterval(presence.checkTick);
    },
    recentlyDelayed: false,
    delay: function(seconds) {
        console.log(`Delaying for ${seconds} seconds`);
        presence.recentlyDelayed = true;

        presence.cancel();
        setTimeout(() => {
            presence.init();

            // 5 second window to turn the light back on and keep it on for longer
            setTimeout(() => {
                presence.recentlyDelayed = false;
            }, 5000);
        }, seconds * 1000);
    }
};

setInterval(() => {
    getTime();
}, 5000);


setInterval(_ => {
    if (time && time[0] == 3) delaying = false;
    if (time && time[0] == 12) {
        getSunTimes();
    }
}, 60 * 1000);

setInterval(_ => {
    isOnline();
}, 2 * 60 * 1000);

app.post('/', function(req, res) {
    let body = req.body;

    if (body.reboot && body.reboot == secret.pass) {
        log('Reboot requested from ' + req.ip);
        setTimeout(() => {
            exec('reboot -f');
        }, 1000);
    } else if (body.reboot !== secret.pass) {
        log('Incorrect password for remote reboot from ' + req.ip);
    }

    if (body.keepon) {
        hue.light.on("Main " + room);
        presence.cancel();

        log('Keeping ' + room + ' light on for ' + (body.keepon) + ' minutes');
        setTimeout(() => {
            presence.init();
        }, (body.keepon * 60 * 1000));

        // Half the time
        setTimeout(() => {
            blink(1);
            speak(`Time is half up on ${room} lights`);
        }, ((body.keepon - (body.keepon / 2)) * 60 * 1000));

        // A quarter of the time
        setTimeout(() => {
            blink(2);
            speak(`There is ${(body.keepon - (body.keepon / 4) * 60 * 1000)} minutes left on the ${room} lights`);
        }, ((body.keepon - (body.keepon / 4)) * 60 * 1000));

        // A fifth of the time
        setTimeout(() => {
            blink(3);
        }, (body.keepon - (body.keepon - 5)) * 60 * 1000);
    }
});


app.listen(8080, (err) => {
    init(() => {
        if (err) error('Express failed to start the web server');
        log('Listening on port 8080');
    });
});
