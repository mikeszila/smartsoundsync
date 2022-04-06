const { exec, spawn, execSync } = require('child_process');

let muteVolumeSave = -90
let muted = false

function adjustVolume(button) {
    if (captureState == 'active') {

        if (button == 'UP') {
            console.log('UP')
            if (muted == true) {
                volumeOut = muteVolumeSave
                muted = false
            } else {
                volumeOut = volumeOut + settings.volume_db_step
            }
        }

        if (button == 'DOWN') {
            console.log('DOWN')

            if (muted == true) {
                muteVolumeSave = muteVolumeSave - settings.volume_db_step

                console.log('down while mute', muteVolumeSave)
            } else {
                volumeOut = volumeOut - settings.volume_db_step
            }

        }

        if (button == 'MUTE') {      
            console.log('muted in', muted)      
            if (muted == false) {
                muteVolumeSave = volumeOut
                muted = true                
            } else {
                volumeOut = muteVolumeSave
                muted = false
            }

            console.log('muted:', muted, muteVolumeSave, volumeOut)
        }

        if (volumeOut > settings.volume_db_max) {
            volumeOut = settings.volume_db_max
        }

        if (volumeOut < settings.volume_db_min) {
            volumeOut = settings.volume_db_min
        }
        if (muted) { volumeOut = -200 }
        console.log(volumeOut)
        buffertoudp.sendStatusUpdatetoSink()
    }
}


function spawnremote() {
    console.log(new Date().toISOString(), 'started remote')
    remote = spawn('/usr/bin/irw');

    remote.stdout.on('data', (data) => {
        //console.log(new Date().toISOString(), 'remote', 'stdout', `${data}`)

        //  if (playbackHostname == hostname && playbackPort == audioSourcePort) {

        command = String(data)

        if (command.includes(' 01 ') == false && captureState == 'active') {

            if (command.includes('KEY_VOLUMEUP')) {
                console.log('KEY_VOLUMEUP')
                adjustVolume('UP')
            }

            if (command.includes('KEY_VOLUMEDOWN')) {
                console.log('KEY_VOLUMEDOWN')
                adjustVolume('DOWN')
            }

            if (command.includes('KEY_MUTE')) {
                console.log('KEY_MUTE')
                adjustVolume('MUTE')
            }
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