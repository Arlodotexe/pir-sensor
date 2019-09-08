// scp ./node.js root@192.168.0.203:"'/root/PIR Sensor/node.js'"

'use strict';
const exec = require('child_process').exec;
const hue = require('./hue');
const requestify = require('requestify');
const express = require('express'), app = express();
const bodyParser = require('body-parser');
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
        getUpdatedSunTimes(() => {
            setDynamicBrightness();
        });

        blink(1);
        speak(room + ' motion sensor is ready');
        presence.init();
        if (typeof cb == 'function') cb();
    } else {
        setTimeout(() => {
            init();
        }, 200);
    }
}

function updateTime() {
    log('Getting updated time');
    requestify.get(secret.mmserverAddress + '/time').then(function (response) {
        // Get the response body
        response = response.getBody();
        try {
            let body = JSON.parse();
            time = body;
        } catch (err) {
            error(err);
        }
    });
}

function getUpdatedSunTimes(cb) {
    log('Getting sun data');

    requestify.get(secret.mmserverAddress + '/sundata').then(function (response) {
        // Get the response body
        response = response.getBody();
        try {
            let body = JSON.parse();

            sunset = body.sunset;
            sunrise = body.sunrise;
            goldenHour = body.goldenHour;
            goldenHourEnd = body.goldenHourEnd;
            cb(body);
        } catch (err) {
            error(err);
        }
    });
}

//#region polyfills
var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = !0; var _d = !1; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = !0) { _arr.push(_s.value); if (i && _arr.length === i) break } } catch (err) { _d = !0; _e = err } finally { try { if (!_n && _i["return"]) _i["return"]() } finally { if (_d) throw _e } } return _arr } return function (arr, i) { if (Array.isArray(arr)) { return arr } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i) } else { throw new TypeError("Invalid attempt to destructure non-iterable instance") } } }();
function toMilitaryTime(time12h) {
    var _time12h$split = time12h.split(' '), _time12h$split2 = _slicedToArray(_time12h$split, 2), time = _time12h$split2[0], modifier = _time12h$split2[1]; var _time$split = time, _time$split2 = _slicedToArray(_time$split, 2), hours = _time$split2[0], minutes = _time$split2[1]; if (hours === '12') { hours = '00' }
    if (modifier === 'PM') { hours = parseInt(hours, 10) + 12 }
    return [hours, minutes]
}
//#endregion
function assignRoom() {
    let ip = require('os').networkInterfaces().apcli0[0].address;
    let mac = require('os').networkInterfaces().apcli0[0].mac;

    switch (ip) {
        case '192.168.0.203':
            room = 'Kitchen';
            break;
        case '192.168.0.202':
            room = 'Bathroom';
            break;
        default:
            error('IP Address is not bound to a room: ' + ip + '.\n Hardware ID is: ' + mac.substr(mac.length - 4));
    }
}

const error = function (msg) {
    console.trace(msg);
     requestify.post(secret.mmserverAddress, {
         error: '(silent)' + room + ' motion sensor: ' + msg
     });
 
     requestify.post(secret.mmserverAddress, {
         speak: '(noheader)(v:Microsoft Eva Mobile) Something went wrong with the ' + room + ' motion sensor: ' + msg
     });
}

const log = function (msg) {
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
    hue.light.get.isOn('Main ' + room).then(state => {
        var state1 = (state ? "on" : "off");
        var state2 = (!state ? "on" : "off");

        function timedOnOff(timesRemaining) {
            hue.light[state1]('Main ' + room);
            setTimeout(() => {
                hue.light[state2]('Main ' + room);
                if (time > 0) timedOnOff(timesRemaining - 1);
            }, 500);
        }

        timedOnOff(time);

        setTimeout(() => {
            hue.light[state1]('Main ' + room); // reset to original state
        }, 500 * times);
    })
}

function setDynamicBrightness() {
    let brightness = 100; // Default is max

    // Intermediate brightness when it's getting dark outside
    if ((isAfterSunrise() && isGettingDark() && !isAfterSunset()) && (room !== 'Bathroom')) brightness = 75;

    // Don't turn on the lights (Outside the bathroom) if it's the middle of the day
    /* if ((isAfterSunrise() && !isGettingDark() && !isAfterSunset()) && (room !== 'Bathroom')) delaying = true; */

    // If it's past 3AM, dim the lights a lot so you don't burn your eyes out using the bathroom or getting a snack
    if ((isAfterSunset() && !isGettingLight() && (time && toMilitaryTime(time)[0] > 3))) {
        brightness = 25;
    }

    // But if it's not yet passed 3AM, keep the lights bright. Someone might still be awake and using them.
    else if ((isAfterSunset() && !isGettingLight())) {
        brightness = 75;
    }

    // It's almost morning, intermediate brightness
    if ((isAfterSunset() && isGettingLight() && !isAfterSunrise())) brightness = 50;

    console.log(`Adjusting brightness to ${brightness}`);
    hue.light.brightness('Main ' + room, brightness); // this is broken
}

function hasPresence() {
    return new Promise(resolve => {
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

/**
 * @summary Used in a SetInterval to continuously check for a presence
 */
function recursivePresenceCheck() {
    hasPresence().then(isPresent => {
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
            setDynamicBrightness();
            presence.lastPowerState = true;
        }

        switch (room) {
            case "Kitchen":
                presence.delay(presence.recentlyDelayed ? 60 : 15);
                break;
            case "Bathroom":
                presence.delay(presence.recentlyDelayed ? 60 : 10);
                break;
            default:
                error("Invalid light room name while checking light presence " + room);
        }
    });
}

let presence = {
    /**
     * @summary Function that periodically executes to check for a presence 
     */
    checkTick: undefined,
    lastPowerState: false,
    init: function (intervalMS) {
        if (hue.ready) {
            presence.checkTick = setInterval(recursivePresenceCheck, intervalMS ? intervalMS : 1000);
        }
    },
    cancel: function () {
        clearInterval(presence.checkTick);
    },
    recentlyDelayed: false,
    delay: function (seconds) { // not delaying if presense is found before the light turns back off
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


app.post('/', function (req, res) {
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
        setInterval(() => {
            updateTime();

            if (time && time[0] == 12) {
                getUpdatedSunTimes();
            }
        }, 60 * 1000);

        if (err) error('Express failed to start the web server');
        log('Listening on port 8080');
    });
});
