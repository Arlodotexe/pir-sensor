let sunrise, sunset;
let lat = 42.562986, long = -92.499992;
const SunCalc = require('suncalc');
const requestify = require('requestify');

function toMilitaryTime(time) {
    var o = time.match(/(\d+):(\d+):(\d+) (\w)/), r = +o[1], a = +o[2], e = +o[3], n = o[4].toLowerCase();
    return "p" == n && 12 > r ? r += 12 : "a" == n && 12 == r && (r -= 12), [ r, a, e ];
}

function getSunsetSunrise() {
    return new Promise(resolve => {
        let sunData = SunCalc.getTimes(new Date(), lat, long);
        sunset = sunData.goldenHour.toLocaleTimeString();
        sunrise = sunData.goldenHourEnd.toLocaleTimeString();
        resolve();
    });
}

function isAfterSunset() {
    if (toMilitaryTime(new Date().toLocaleTimeString())[0] > toMilitaryTime(sunset)[0]) return true;
    else return false;
}

function isAfterSunrise() {
    if (toMilitaryTime(new Date().toLocaleTimeString())[0] > toMilitaryTime(sunrise)[0]) return true;
    else return false;
}

getSunsetSunrise()
    .then(_ => {
        console.log(isAfterSunrise());
        console.log(isAfterSunset());
})