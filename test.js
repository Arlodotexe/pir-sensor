'use strict';
let sunrise, sunset, goldenHour, goldenHourEnd;
const requestify = require('requestify');


function getSunTimes() {
    return new Promise(resolve => {
        requestify.get('http://192.168.0.100:8082/sundata').then(function(response) {
            body = JSON.parse(response.body);
            sunset = body.sunset;
            sunrise = body.sunrise;
            goldenHour = body.goldenHour;
            goldenHourEnd = body.goldenHourEnd;
            console.log('sun times: ', body);
            resolve();
        });
    });
}

getSunTimes()
    .then(function() {
        console.log(sunrise, sunset, goldenHour, goldenHourEnd);
    })

