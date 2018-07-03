'use strict';
const exec = require('child_process').exec;
const hue = require('./hue');
const requestify = require('requestify');
const express = require('express'), app = express();
const bodyParser = require('body-parser');
const secret = require('./secret');
const SunCalc = require('suncalc');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

let sunrise, sunset, goldenHour, goldenHourEnd;
let lat = 42.562986, long = -92.499992;

let prevState = false;
let delaying, delayTimeout, delayInterval, room;

function replaceAll(str, find, replace) {
    'use strict';
    return String.raw`${str}`.replace(new RegExp(find.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1'), 'g'), replace);
}

function toMilitaryTime(time) {
    var o = time.match(/(\d+):(\d+):(\d+) (\w)/), r = +o[1], a = +o[2], e = +o[3], n = o[4].toLowerCase();
    return "p" == n && 12 > r ? r += 12 : "a" == n && 12 == r && (r -= 12), [r, a, e];
}

const error = function(msg) {
    requestify.post('http://arlo.bounceme.net:8082/', {
        error: room + ' motion sensor: ' + msg
    });

    requestify.post('http://arlo.bounceme.net:8082/', {
        speak: 'Something went wrong with the ' + room + ' motion sensor: ' + msg
    });
}

const log = function(msg) {
    requestify.post('http://arlo.bounceme.net:8082/', {
        log: room + ' motion sensor: ' + msg
    });
    console.log(msg);
}

function getSunTimes() {
    return new Promise(resolve => {
        let sunData = SunCalc.getTimes(new Date(), lat, long);
        goldenHour = sunData.goldenHour.toLocaleTimeString();
        goldenHourEnd = sunData.goldenHourEnd.toLocaleTimeString();
        sunset = sunData.sunset.toLocaleTimeString();
        sunrise = sunData.sunrise.toLocaleTimeString();
        resolve();
    });
}

function isGettingDark() {
    if (toMilitaryTime(new Date().toLocaleTimeString())[0] > toMilitaryTime(goldenHour)[0]) return true;
    else return false;
}
function isGettingLight() {
    if (toMilitaryTime(new Date().toLocaleTimeString())[0] > toMilitaryTime(goldenHourEnd)[0]) return true;
    else return false;
}
function isAfterSunset() {
    if (toMilitaryTime(new Date().toLocaleTimeString())[0] > toMilitaryTime(sunset)[0]) return true;
    else return false;
}
function isAfterSunrise() {
    if (toMilitaryTime(new Date().toLocaleTimeString())[0] > toMilitaryTime(sunrise)[0]) return true;
    else return false;
}

function assignRoom() {
    let ip = require('os').networkInterfaces().apcli0[0].address;
    let mac = require('os').networkInterfaces().apcli0[0].mac;

    switch (ip) {
        case '192.168.0.202':
            room = 'Kitchen';
            break;
        case '192.168.0.201':
            room = 'Bathroom';
            break;
        default:
            error('IP Address is not bound to a room: ' + ip + '.\n Hardware ID is: ' + mac.substr(mac.length - 4));
    }
}

function init() {
    if (hue.ready) {
        assignRoom();
        exec('fast-gpio set-input 11');
        log('Connected to Philips Hue Bridge');
        getSunTimes().then(_ => { log('Retrieved sunset, sunrise, and golden hour times') });

        hue.light.on('Main ' + room);
        setTimeout(() => {
            hue.light.off('Main ' + room);
            log(room + ' sensor is ready');
        }, 500);

        delaying = false;
    } else {
        setTimeout(() => {
            init();
        }, 200);
    }
}

function isOnline() {
    return new Promise(resolve => {
        exec('ping -c 1 1.1.1.1', (err, stdout) => {
            if (err) error(err);
            if (!stdout.includes('0% packet loss')) {
                exec('reboot -f');
            } else {
                resolve(true);
            }
        });
    });
}

function hasPresence() {
    if (hue.ready) return new Promise(resolve => {
        exec('fast-gpio read 11', (err, stdout) => {
            if (err) error(err);
            stdout = replaceAll(stdout, '> Read GPIO11:', '');
            console.log('state: ' + stdout);
            if (stdout.includes('1')) {
                resolve(true)
            }
            if (stdout.includes('0')) {
                resolve(false);
            }
        });
    });
}

function delayFor(initialDelay, secondaryDelay) {
    delaying = true;
    console.log('Delaying for ' + initialDelay + ' seconds');
    clearTimeout(delayTimeout);
    clearInterval(delayInterval);
    delayTimeout = setTimeout(() => {
        delaying = false;
        clearInterval(delayInterval);
    }, initialDelay * 1000);

    setTimeout(() => {
        delayInterval = setInterval(_ => {
            if (hue.ready && delaying == true) {
                hasPresence()
                    .then(result => {
                        if (result) {
                            delayFor(secondaryDelay ? secondaryDelay : initialDelay);
                        }
                    })
            }
        }, 1000);
    }, 5000);
}

setInterval(() => {
    if (hue.ready) {
        hasPresence()
            .then((result) => {
                if (delaying == false && result && prevState == false) {
                    hue.light.on('Main ' + room);
                    prevState = true;
                    if (room == 'Kitchen') delayFor(9, 20);
                    if (room == 'Bathroom') delayFor(10, 30);
                } else if (delaying == false && result == false && prevState == true) {
                    hue.light.off('Main ' + room);
                    prevState = false;
                }
            });
        // Intermediate brightness when it's getting dark outside
        if ((isAfterSunrise() && isGettingDark()) && (room !== 'Bathroom')) hue.light.brightness('Main ' + room, 75);

        // Don't turn on the lights (Outside the bathroom) if it's the middle of the day
        if ((isAfterSunrise() && !isGettingDark()) && (room !== 'Bathroom')) delaying = true;

        // If it's past 2AM, dim the lights a lot so you don't burn your eyes out using the bathroom or getting a snack
        if ((isAfterSunset() && !isGettingLight() && toMilitaryTime(new Date.toLocaleTimeString().split(':'))[0] > 2)) hue.light.brightness('Main ' + room, 25);

        // But if it's not yet passed 2AM, keep the lights bright. Someone might still be awake and using them.
        else if ((isAfterSunset() && !isGettingLight())) hue.light.brightness('Main ' + room, 75);

        // It's almost morning, intermediate brightness
        if ((isAfterSunset() && isGettingLight())) hue.light.brightness('Main ' + room, 50);

    }
}, 1000);


setInterval(_ => {
    if (new Date().toLocaleTimeString().split(':')[0] == 3) delaying = false;
    if (new Date().toLocaleTimeString().split(':')[0] == 12) {
        getSunTimes();
    }
}, 60 * 1000);

setInterval(_ => {
    isOnline();
}, 5 * 60 * 1000);

app.post('/', function(req, res) {
    let body = req.body;

    if (body.reboot && body.reboot == secret.pass) {
        log('Reboot requested from ' + req.ip);
        setTimeout(() => {
            exec('reboot -f');
        }, 1000);
    } else if(body.reboot !== secret.pass) {
        error('Incorrect password for remote reboot');
    }

    if (body.keepon) {
        delaying = true;
        log('Keeping ' + room + ' light on for ' + (body.keepon) + ' minutes');
        setTimeout(() => {
            delaying = false;
        }, (body.keepon * 60 * 1000));
        setTimeout(() => {
            hue.light.off('Main' + room);
            setTimeout(() => {
                hue.light.on('Main' + room);
            }, 500);
        }, ((body.keepon - (body.keepon / 2)) * 60 * 1000));

        setTimeout(() => {
            hue.light.off('Main' + room);
            setTimeout(() => {
                hue.light.on('Main' + room);
                setTimeout(() => {
                    hue.light.off('Main' + room);
                    setTimeout(() => {
                        hue.light.on('Main' + room);
                    }, 500);
                }, 500);
            }, 500);
        }, ((body.keepon - (body.keepon / 4)) * 60 * 1000));

        setTimeout(() => {
            hue.light.off('Main' + room);
            setTimeout(() => {
                hue.light.on('Main' + room);
                setTimeout(() => {
                    hue.light.off('Main' + room);
                    setTimeout(() => {
                        hue.light.on('Main' + room);
                        setTimeout(() => {
                            hue.light.off('Main' + room);
                            setTimeout(() => {
                                hue.light.on('Main' + room);
                            }, 500);
                        }, 500);
                    }, 500);
                }, 500);
            }, 500);
        }, body.keepon - (body.keepon - 5));
    }
});


app.listen(8080, (err) => {
    init();
    if (err) error('Express failed to start the web server');
    log('Listening on port 8080');
});
