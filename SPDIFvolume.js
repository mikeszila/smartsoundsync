const { exec, spawn, execSync } = require('child_process');

let audio_devices = String(execSync('cat /proc/bus/input/devices', {}))

if (audio_devices.includes('ICUSBAUDIO7D')) {
    execSync(`amixer -c ICUSBAUDIO7D sset 'PCM Capture Source' 'IEC958 In'`, {})
}

function keyBoardProcess(data) {
    keyData = String(data)
    if (keyData.includes('(KEY_VOLUMEUP)') && (keyData.includes('value 1') || keyData.includes('value 2'))) {
        adjustVolume('UP')
    }
    if (keyData.includes('(KEY_VOLUMEDOWN)') && (keyData.includes('value 1') || keyData.includes('value 2'))) {
        adjustVolume('DOWN')
    }
    if (keyData.includes('(KEY_MUTE)') && (keyData.includes('value 1') || keyData.includes('value 2'))) {
        adjustVolume('MUTE')
    }
}

let keyBoards = {}
let keyBoardName

function createKeyboard(eventNumber) {

    keyBoardName = `keyboard${eventNumber}`

    keyBoards[keyBoardName] = spawn("evtest", [`/dev/input/event${eventNumber}`])

    keyBoards[keyBoardName].stdout.on('data', (data) => {
        keyBoardProcess(data)
    });

}

let proc_bus_input_devices = execSync('cat /proc/bus/input/devices', {})
proc_bus_input_devices = String(proc_bus_input_devices)

let devices_lines = proc_bus_input_devices.split('\n\n');

let eventIndex = 0
devices_lines.forEach(function (value, index) {

    let deviceName = getValue(value, 'N: Name="', '"')
    let deviceHandlers = getValue(value, 'H: Handlers=', '\n')
    let deviceEvent = getValue(deviceHandlers, 'event', ' ')
    let monitorDevice = 'no'

    if (
        deviceHandlers.includes('kbd') &&
        !deviceName.includes('Power') &&
        !deviceName.includes('Video') &&
        //!deviceName.includes('flirc Keyboard') &&
        !deviceName.includes('flirc System Control') &&
        !deviceName.includes('HP Wireless hotkeys') &&
        !deviceName.includes('HP WMI hotkeys') &&
        !deviceName.includes('Webcam')
    ) {
        monitorDevice = 'yes'
    }
    if (monitorDevice == 'yes') {
        console.log('Name: ', deviceName, 'Handlers: ', deviceHandlers, 'Event: ', deviceEvent, monitorDevice)
        createKeyboard(deviceEvent)
    }
})


function getValue(value, startText, endText) {
    let startIDX = value.indexOf(startText) + startText.length
    let endIDX = value.indexOf(endText, startIDX)
    //console.log(startIDX,endIDX )
    return value.slice(startIDX, endIDX)
}

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
let irwtest
try {irwtest = execSync('which irw')}
catch {console.log('irw not installed, not starting remote')}
if (irwtest) { spawnremote() }