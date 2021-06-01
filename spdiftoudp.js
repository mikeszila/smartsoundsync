const { exec, spawn, execSync } = require('child_process');
common = require('./common.js')


var localSettings = {
    source_period_size: 441,
    source_buffer_periods: 2,
    playback_period_size: 441,
    playback_buffer_periods: 4,
    setupPriority: 1,
    audioSourceType: 'spdif'
}


settings = { ...settings, ...localSettings }

//settings.verbose = true

cmdlineSTR = String(process.argv)
cmdSettingsJSON = cmdlineSTR.slice(cmdlineSTR.lastIndexOf('{'), cmdlineSTR.lastIndexOf('}') + 1)

if (cmdSettingsJSON != 0) {
    cmdSettingsObj = JSON.parse(String(cmdSettingsJSON))
    settings = { ...settings, ...cmdSettingsObj }
}

console.log(settings)

global.hwtobuffer = require('./hwtobuffer.js')
global.buffertoudp = require('./buffertoudp.js')

function dspSet() {
    let commands = [
        //'dsptoolkit set-volume 0%',
        'dsptoolkit set-limit 0db',

        'dsptoolkit write-mem 0xF106 0x0003',
        'dsptoolkit write-mem 0xF146 0x0004',
        'dsptoolkit write-mem 0xF107 0x0000',
        'dsptoolkit write-mem 0xF195 0x0000',
        'dsptoolkit write-mem 0xF194 0x0033',
        'dsptoolkit write-mem 0xF21C 0x6C40',

        'dsptoolkit write-reg 0xF106 0x0003',
        'dsptoolkit write-reg 0xF146 0x0004',
        'dsptoolkit write-reg 0xF107 0x0000',
        'dsptoolkit write-reg 0xF195 0x0000',
        'dsptoolkit write-reg 0xF194 0x0033',
        'dsptoolkit write-reg 0xF21C 0x6C40'
    ]

    commands.forEach(function (value, index) {
        common.tryExec(value)
    })
}

dspSet()

function spawnremote() {
    console.log(new Date().toISOString(), 'started remote')
    remote = spawn('/usr/bin/irw');

    remote.stdout.on('data', (data) => {
        //console.log(new Date().toISOString(), 'remote', 'stdout', `${data}`)

        //  if (playbackHostname == hostname && playbackPort == audioSourcePort) {

        command = String(data)

        if (command.includes(' 01 ') == false && captureState == 'active') {

            if (command.includes('KEY_VOLUMEUP')) {
                console.log('UP')
                volumeOut = volumeOut + settings.volume_db_step
            }

            if (command.includes('KEY_VOLUMEDOWN')) {
                console.log('DOWN')
                volumeOut = volumeOut - settings.volume_db_step
            }

            if (volumeOut > settings.volume_db_max) {
                volumeOut = settings.volume_db_max
            }

            if (volumeOut < settings.volume_db_min) {
                volumeOut = settings.volume_db_min
            }
            buffertoudp.sendStatusUpdatetoSink()
        }
        //  }
    });

    remote.stderr.on('data', (data) => {
        console.log(new Date().toISOString(), 'remote', 'stderr', `${data}`)
    });

    remote.on('close', (code) => {
        console.log('remote CLOSED with code ', code)
    });
}


spawnremote()

var captureStateLast
function checkState() {

    if (!reportedFound) {
        captureState = 'init'

    } else {
        captureState = hwCaptureState
    }

    if (captureState != captureStateLast) {
        buffertoudp.sendStatusUpdatetoControl()
        captureStateLast = captureState
    }
}

setInterval(checkState, 1000)

