"use strict";
const { exec, spawn, execSync } = require('child_process');

global.process = require("process");
global.pad = require('pad')
global.dgram = require('dgram')
global.os = require('os')
global.fs = require('fs');

console.log('pid:', process.pid)

global.hostname = os.hostname()

global.messageTypeAudio = Buffer.from(pad('audio', 10, ' '))
global.messageTypeAudioAck = Buffer.from(pad('audioack', 10, ' '))
global.messageTypeJSON = Buffer.from(pad('JSON', 10, ' '))
global.messageHostname = Buffer.from(pad(hostname, 20, ' '))


global.settings = {  //basic settings for running outside systemd and other common settings. 
    audioSourceDisplayName: hostname,
    audioSourceClients: [hostname],
    ControllerHostname: hostname,
    ControllerPort: 5656,
    remoteControllerHostname: 'Audioserv',
    remoteControllerPort: 5656,
    source_rate: 44100,
    source_channels: 2,
    volume_db_max: 0,
    volume_db_min: -60,
    volume_db_step: 2,
    initialVolume: -40,
    cardName: 'hw:0',
    bytesPerSample: 2,
    verbose: false,
    sourceSampleAdjust: 0
}

global.volumeOut = settings.initialVolume

global.hwCaptureState = 'idle'
global.captureState = 'idle'

global.ntpCorrection = 1

function execSyncPrint(command) {
    console.log(command)
    let returnData = execSync(command, { stdio: 'inherit' })
    //console.log(String(returnData))
    return returnData
}

function readNTP() {
    try {

        fs.statSync('/var/lib/ntp/ntp.drift')
        let data = Number(execSync(`cat /var/lib/ntp/ntp.drift`))
        //console.log(Number(data))

        ntpCorrection = 1 + (1 / (1000000 / Number(data)))
        //console.log(ntpCorrection)
    }
    catch (error) {
        ntpCorrection = 1
    }
}

setInterval(readNTP, 1000)

function tryExec(commands) {
    try { execSyncPrint(commands) }
    catch (error) {
        console.log('could not execute', commands)
    }
}

function speedup() {
    commands = [
        'systemctl stop triggerhappy',
        'systemctl stop dbus',
        'killall console-kit-daemon',
        'killall polkitd',
        'sudo mount -o remount,size=128M /dev/shm',
        'killall gvfsd',
        'killall dbus-daemon',
        'killall dbus-launch',
        'echo -n performance | tee /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor',
        '/sbin/sysctl -w vm.swappiness=10'
    ]

    commands.foreach(function (value, index) {
        tryExec(value)
    })
}

speedup()

function setPriority(pid, priority) {
    exec(`chrt -p ${priority} ${pid}`, (err, stdout, stderr) => {
        if (err) {
            // node couldn't execute the command
            return;
        }

        // the *entire* stdout and stderr (buffered)
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);

        exec(`chrt -p ${pid}`, (err, stdout, stderr) => {
            if (err) {
                // node couldn't execute the command
                return;
            }

            // the *entire* stdout and stderr (buffered)
            console.log(`stdout: ${stdout}`);
            console.log(`stderr: ${stderr}`);
        });
    });
}

module.exports = {
    setPriority,
    execSyncPrint,
    tryExec
}