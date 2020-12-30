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



/*
UDP

localControllerHostname
volume_db_min
bytesPerSample
outputChannels
processPriority
localControllerPort
cardName
*/

global.settings = {
    audioSourceDisplayName: hostname,
    audioSourceClients: [hostname],
    localControllerHostname: hostname,
    localControllerPort: 5656,
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
    username: 'michael',
    sourceSampleAdjust: 0
}

global.volumeOut = settings.initialVolume

global.captureState = 'idle'
global.noInput = false

var speedup

function spawnSpeedup() {
    console.log('speedup', 'spawn')
    speedup = spawn('./speedup.sh');

    speedup.stdout.on('data', (data) => {
        console.log('speedup', data.toString())
    });

    speedup.stderr.on('data', (data) => {
        console.error('speedup', data.toString())
    });

    speedup.on('close', (code) => {
        console.error('speedup', 'close')
    });
}

global.ntpCorrection = 1

function readNTP() {
    let data = Number(execSync(`cat /var/lib/ntp/ntp.drift`))
    //console.log(Number(data))

    ntpCorrection = 1 + (1 / (1000000 / Number(data)))
    //console.log(ntpCorrection)

}

setInterval(readNTP, 1000)

//spawnSpeedup()

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
    setPriority
}