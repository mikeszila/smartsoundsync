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

function execSyncPrint(command) {
    let returnData
    console.log(command)
    try { returnData = execSync(command, { stdio: 'inherit' }) }
    catch (error) { console.log('could not execute', command) }
    //console.log(String(returnData))
    return returnData
}

function tryExec(commands) {
    //try { execSyncPrint(commands) }
    //catch (error) {
    //    console.log('could not execute', commands)
    //}
    execSyncPrint(commands)
}




function speedup() {
    let commands = [
        'systemctl stop triggerhappy',

        'killall console-kit-daemon',
        'killall polkitd',
        'sudo mount -o remount,size=128M /dev/shm',
        'killall gvfsd',

        'killall dbus-launch',
        'echo -n performance | tee /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor',
        '/sbin/sysctl -w vm.swappiness=10'
    ]

    commands.forEach(function (value, index) {
        tryExec(value)
    })
}

//'killall dbus-daemon',
//'systemctl stop dbus',

speedup()

try {

    execSync('which dsptoolkit')
    execSyncPrint('dsptoolkit install-profile https://raw.githubusercontent.com/hifiberry/hifiberry-os/master/buildroot/package/dspprofiles/dspdac-12.xml')
    execSyncPrint('amixer sset DSPVolume 0')
    execSyncPrint('dsptoolkit set-volume 0%')
    execSyncPrint('dsptoolkit write-reg 0xF106 0x0003')
    execSyncPrint('dsptoolkit write-reg 0xF146 0x0004')
    execSyncPrint('dsptoolkit write-reg 0xF195 0x0000')
    execSyncPrint('dsptoolkit write-reg 0xF194 0x0033')
    execSyncPrint('dsptoolkit write-reg 0xF21C 0x6C40')
    


}
catch (error) {
    console.log('dspsetuperror')
}
