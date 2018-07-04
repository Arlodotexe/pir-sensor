'use strict';
let sunrise, sunset;
let lat = 42.562986, long = -92.499992;
const SunCalc = require('suncalc');
const requestify = require('requestify');
let time;


function getSunTimes() {
    return new Promise(resolve => {
        let sunData = SunCalc.getTimes(new Date(), lat, long);
        console.log(sunData)
        console.log(toMilitaryTime(sunData.goldenHour.toLocaleTimeString()[0]))
        console.log(sunData.goldenHourEnd.toLocaleTimeString())
        console.log(sunData.sunset.toLocaleTimeString())
        console.log(sunData.sunrise.toLocaleTimeString())
        resolve();
    });
}

function getTime() {
    return new Promise(resolve => {
        requestify.get('https://www.amdoren.com/api/timezone.php?api_key=4hMwxwRs5UmvwMxSpxPwXaHzFrdV4f&loc=USA,+Iowa,+Waterloo').then(function(response) {
            time = response.getBody().time.split(' ')[1];
            resolve(response.getBody().time.split(' ')[1]);
        });
    });
}


console.log(toMilitaryTime('10:00 PM'));
