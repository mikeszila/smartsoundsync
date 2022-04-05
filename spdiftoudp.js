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


let volume

if (settings.volumeControlScript) {
    volume = require(settings.volumeControlScript);
} else {
    volume = require(`./spdifVolume.js`);
}




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

