const { exec, spawn, execSync } = require('child_process');
common = require('./common.js')


var localSettings = {
    source_period_size: 441,
    source_buffer_periods: 2,
    playback_period_size: 441,
    playback_buffer_periods: 4,
    processPriority: 80,
    setupPriority: 1,
    audioSourceType: 'spdif'
}


settings = { ...settings, ...localSettings}

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

function spawndspset() {
    console.log(new Date().toISOString(), 'Writing DSP settings')
    dspset = spawn('/home/pi/audio/dspsetup.sh');

    dspset.stdout.on('data', (data) => {
        console.log(new Date().toISOString(), 'dspset', 'stdout', `${data}`)
    });

    dspset.stderr.on('data', (data) => {
        console.log(new Date().toISOString(), 'dspset', 'stderr', `${data}`)
    });

    dspset.on('close', (code) => {
    });
}

spawndspset()



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
        if (noInput) {
            captureState = 'idle'
        } else {
            captureState = 'active'
        }
    }


    if (captureState != captureStateLast) {

        buffertoudp.sendStatusUpdatetoControl()
        captureStateLast = captureState
    }


}

setInterval(checkState, 2000)

