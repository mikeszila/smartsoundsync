"use strict";

const { exec, spawn, execSync } = require('child_process');

function ntpXFACCheck() {
    
    let ntpData = execSync('ntpq -pn')
    ntpData = String(ntpData)
    //console.log(ntpData)

    if (ntpData.includes('.XFAC.')) {
        console.log('.XFAC. found, restarting NTP')
        execSync('systemctl restart ntp')
    }
}

console.log('smartsoundsync ntp XFAC reset logic')
ntpXFACCheck()
setInterval(ntpXFACCheck, 60000)