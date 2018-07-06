/*jslint es6 */
'use strict';
const hue = require("node-hue-api");
const HueApi = hue.HueApi;
const state = hue.lightState.create();
const secret = require('./secret');
const requestify = require('requestify');
let room;

let ip = require('os').networkInterfaces().apcli0[0].address;
let mac = require('os').networkInterfaces().apcli0[0].mac;

switch (ip) {
    case secret.devices[3].ip:
        room = 'Kitchen';
        break;
    case secret.devices[2].ip:
        room = 'Bathroom';
        break;
    default:
        error('IP Address is not bound to a room: ' + ip + '.\n Hardware ID is: ' + mac.substr(mac.length - 4));
}

const Win = {
    log: function(msg) {
        console.log(msg);
    },
    error: function(msg) {
        requestify.post(secret.mmserverAddress, {
            error: room + ' motion sensor: ' + msg
        });
        console.error(msg);
    }
}

function log(msg) {
    requestify.post(secret.mmserverAddress, {
        log: room + ' motion sensor: ' + msg
    });
    console.log(msg);
}

function error(msg) {
    console.error(msg);
}

let username = secret.hueUsername,
    api,
    userDescription = "nodejs";

function connect() {
    hue.nupnpSearch(function(err, result) {
        if (err) throw err;
        let host = result[0].ipaddress;
        api = new HueApi(host, username);

        api.lights(function(err, result) {
            if (err) throw err;
            control.lights = result.lights;
        });

        api.groups(function(err, result) {
            if (err) throw err;
            control.groups = result;
        });

        var displayResult = function(result) {
            Win.log('Hue bridge connected');
            control.ready = true;
        };
        api.config().then(displayResult).done();
    });
}



function idFromName(name, type) {
    let a;
    if (type == undefined || type == 'light') {
        type = 'light'; a = control.lights;
    }
    else if (type == 'group') a = control.groups;

    for (var i in type) {
        if (a.hasOwnProperty(i)) {
            if (a[i].name == name) {
                return a[i].id;
            } else if (i == a.length - 1) {
                Win.log('Couldn\'t find the ' + type + ' "' + name + '". See list of ' + type + 's with `hue.' + type + 's`');
            }
        }
    }
}

const control = {
    log: function(func) {
        console.log('Set new log function');
        if (typeof func == 'function') Win.log = func;
        else console.error('Cannot set custom log function: parameter type must be function');
    },
    error: function(func) {
        console.log('Set new error function');
        if (typeof func == 'function') Win.error = func;
        else console.error('Cannot set custom error function: parameter type must be function');
    },
    all: {
        brightness: function(percentage) {
            for (var i in control.lights) {
                if (control.lights.hasOwnProperty(i)) {
                    api.setLightState(control.lights[i].id, state.brightness(percentage))
                        .then().fail(() => {
                            Win.error('Failed to change brightness.');
                        }).done();
                }
            }
            /*
            fn.increment = function(name, int) {
                for (var i in control.lights) {
                    if (control.lights.hasOwnProperty(i)) {
                        api.setLightState(control.lights[i].id, state.bri_inc(int))
                            .then(() => {
                                Win.error(control.lights[i].name + ' brightness changed ' + int);
                            }).fail(() => {
                                Win.error(control.lights[i].name + ' failed to increment brightness.');
                            }).done();
                    }
                }
            }
            return fn; */
        },
        on: function() {
            for (var i in control.lights) {
                if (control.lights.hasOwnProperty(i)) {
                    api.setLightState(control.lights[i].id, state.on())
                        .then(() => {
                            Win.log('Turned on ' + control.lights[i].name);
                        })
                        .fail(() => {
                            Win.error(control.lights[i].name + ' failed to turn on.');
                        }).done();
                }
            }
        },
        off: function() {
            for (var i in control.lights) {
                if (control.lights.hasOwnProperty(i)) {
                    api.setLightState(control.lights[i].id, state.off())
                        .then(() => {
                            Win.log('Turned off ' + control.lights[i].name);
                        }).fail(() => {
                            Win.error(control.lights[i].name + ' failed to turn off.');
                        }).done();
                }
            }
        },
        color: function(rgb) {
            if (typeof rgb !== object) Win.error('Second parameter must be an object with RGB values');
            else if (!rgb || rgb.r == undefined || rgb.b == undefined || rgb.g == undefined) Win.error('RGB values were not defined properly: R' + rgb.r + ', G' + rgb.g + ', B' + rgb.b);
            else {
                for (var i in control.lights) {
                    if (control.lights.hasOwnProperty(i)) {
                        api.setLightState(control.lights[i].id, state.rgb(rgb.r, rgb.g, rgb.b))
                            .then(() => {
                                Win.log(control.lights[i].name + ' color changed to ' + rgb.toString());
                            }).fail(() => {
                                Win.error(control.lights[i].name + ' failed to change color.');
                            }).done();
                    }
                }
            }
        },
    },
    light: {
        get: {
            isOn: function(lightname) {
                return new Promise((resolve, reject) => {
                    api.lights()
                        .then((result) => {
                            for (var i in result.lights) {
                                if (result.lights.hasOwnProperty(i)) {
                                    if (result.lights[i].id == idFromName(lightname, 'light')) {
                                        resolve(result.lights[i].state.on);
                                    }
                                }
                            }
                        })
                        .done();
                })
            },
            brightness: function(lightname) {
                return new Promise((resolve, reject) => {
                    api.lights()
                        .then((result) => {
                            for (var i in result.lights) {
                                if (result.lights.hasOwnProperty(i)) {
                                    if (result.lights[i].id == idFromName(lightname, 'light')) {
                                        resolve(result.lights[i].state.bri);
                                    }
                                }
                            }
                        })
                        .done();
                })
            },
            lightType: function(lightname) {
                return new Promise((resolve, reject) => {
                    api.lights()
                        .then((result) => {
                            for (var i in result.lights) {
                                if (result.lights.hasOwnProperty(i)) {
                                    if (result.lights[i].id == idFromName(lightname, 'light')) {
                                        resolve((result.lights[i].capabilities && result.lights[i].capabilities.control.colorgamuttype) ? 'color' : 'plain');
                                    }
                                }
                            }
                        })
                        .done();
                })
            },
            currentColor: function(name) {
                return new Promise((resolve, reject) => {
                    api.lightStatusWithRGB(idFromName(name))
                        .then((result) => {
                            console.log(result)
                            resolve(result.state.rgb);
                        })
                        .fail(() => {
                            Win.error(name + ' failed to retrieve color');
                        }).done();
                });
            }
        },
        color: function(name, rgb) {
            if (typeof rgb !== 'object') Win.error('Second parameter must be an object with RGB values');
            else if (!rgb || rgb.r == undefined || rgb.b == undefined || rgb.g == undefined) Win.error('RGB values were not defined properly: R' + rgb.r + ', G' + rgb.g + ', B' + rgb.b);
            else {
                api.setLightState(idFromName(name), state.rgb(rgb.r, rgb.g, rgb.b))
                    .then(() => {
                        Win.log(name + ' hue changed to ' + value);
                    }).fail(() => {
                        Win.error(name + ' failed to change hue state');
                    }).done();
            }
        },
        brightness: function(name, percentage) {
            control.light.get.isOn(name)
                .then(result => {
                    if (result) {
                        api.setLightState(idFromName(name), state.brightness(percentage))
                            .then(() => {
                                log(name + ' brightness changed to ' + percentage);
                            }).fail(() => {
                                error(name + ' failed to change brightness state');
                            }).done();
                    }
                })
        },
        on: function(name) {
            api.setLightState(idFromName(name), state.on())
                .then(() => {
                    Win.log(name + ' light was turned on');
                })
                .fail(() => {
                    Win.error(name + ' light failed to turn on');
                })
                .done();
        },
        off: function(name) {
            api.setLightState(idFromName(name), state.off())
                .then(() => {
                    Win.log(name + ' light was turned off');
                })
                .fail(() => {
                    Win.error(name + ' light failed to turn off');
                })
                .done();
        }
    },
    group: {
        get: {
            brightness: function(lightname) {
                return new Promise(resolve => {
                    api.groups()
                        .then(result => {
                            for (var i in result) {
                                if (result.hasOwnProperty(i)) {
                                    if (result[i].id == idFromName(lightname, 'group')) {
                                        resolve(result[i].action.bri);
                                    }
                                }
                            }
                        })
                        .done();
                })
            },
            lightType: function(lightname) {
                return new Promise(resolve => {
                    api.groups()
                        .then(result => {
                            for (var i in result) {
                                if (result.hasOwnProperty(i)) {
                                    if (result[i].id == idFromName(lightname, 'group')) {
                                        console.log(result[i])
                                        resolve(result[i].action.hue ? 'color' : 'plain');
                                    }
                                }
                            }
                        })
                        .done();
                })
            }
        },
        color: function(name, rgb) {
            if (typeof rgb !== 'object') Win.error('Second parameter must be an object with RGB values');
            else if (!rgb || rgb.r == undefined || rgb.b == undefined || rgb.g == undefined) Win.error('RGB values were not defined properly: R' + rgb.r + ', G' + rgb.g + ', B' + rgb.b);
            else {
                api.setGroupLightState(idFromName(name, 'group'), state.rgb(rgb.r, rgb.g, rgb.b))
                    .then(() => {
                        Win.log(name + ' hue changed to ' + value);
                    }).fail(() => {
                        Win.error(name + ' failed to change hue state');
                    }).done();
            }
        },
        brightness: function(name, percentage) {
            api.setGroupLightState(idFromName(name, 'group'), state.brightness(percentage))
                .then(() => {
                    Win.log(name + ' brightness changed to ' + percentage);
                }).fail(() => {
                    Win.error(name + ' failed to change brightness to ' + percentage);
                }).done();
            /* 
            fn.increment = function(name, int) {
                console.log('ran');
                api.setLightState(idFromName(name, 'group'), state.bri_inc(int))
                    .then(() => {
                        Win.log(name + ' brightness changed to ' + percentage);
                    }).fail(() => {
                        Win.error(name + ' failed to change brightness state');
                    }).done();
            }

            return fn; */

        },
        on: function(name) {
            api.setGroupLightState(idFromName(name, 'group'), state.on())
                .then(() => {
                    Win.log(name + ' light was turned on');
                })
                .fail(() => {
                    Win.error(name + ' light failed to turn on');
                })
                .done();
        },
        off: function(name) {
            api.setGroupLightState(idFromName(name, 'group'), state.off())
                .then(() => {
                    Win.log(name + ' lights were turned off');
                })
                .fail(() => {
                    Win.error(name + ' lights failed to turn off');
                })
                .done();
        }
    },
}

connect();
// Keep it connected
setInterval(_ => {
    try {
        api.lights(err => {
            if (err) throw Error(err)
        });
    }
    catch (err) {
        connect();
    }
}, 5 * 60 * 1000)

module.exports = control;