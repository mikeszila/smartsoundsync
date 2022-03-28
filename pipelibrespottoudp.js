const { exec, spawn, execSync } = require('child_process');
common = require('./common.js')
buffertoudp = require('./buffertoudp.js')


let os = require('os')

var localSettings = {
    source_period_size: 2048,
    source_buffer_periods: 2,
    playback_period_size: 512,
    playback_buffer_periods: 4,
    setupPriority: 2,
    audioSourceType: 'Spotify',
    volume_librespot_max: 65535,
    volume_librespot_min: 0,
    sourceSampleAdjust: 2
}

settings = { ...settings, ...localSettings }

cmdlineSTR = String(process.argv)
cmdSettingsJSON = cmdlineSTR.slice(cmdlineSTR.lastIndexOf('{'), cmdlineSTR.lastIndexOf('}') + 1)

if (cmdSettingsJSON != 0) {
    cmdSettingsObj = JSON.parse(String(cmdSettingsJSON))
    settings = { ...settings, ...cmdSettingsObj }
}

global.reported_exact_rate = settings.source_rate
global.reported_buffer_size = settings.source_buffer_periods * settings.source_period_size
global.reported_period_size = settings.source_period_size
global.reported_channels = settings.source_channels
global.reported_period_time = (1 / settings.source_rate) * 1000 * settings.source_period_size
global.source_buffer_time = settings.source_buffer_periods * reported_period_time
global.playback_period_time = (1 / settings.source_rate) * 1000 * settings.playback_period_size
global.playback_buffer_size = settings.playback_period_size * settings.playback_buffer_periods
global.playback_buffer_time = playback_period_time * settings.playback_buffer_periods

let sampleTimeMS = 1 / reported_exact_rate * 1000

if (source_buffer_time > playback_buffer_time) {
    global.desired_playback_delay = source_buffer_time + 50
    console.log('source buffer time', desired_playback_delay)
} else {
    global.desired_playback_delay = playback_buffer_time + 50
    console.log('playback buffer time', desired_playback_delay)
}

let highVolumeLimit = true

let cachefolder = `/tmp/librespotcache`

if (fs.existsSync(cachefolder)) {
    console.log('dir exists', cachefolder)
} else {
    console.log('dir does not exist', cachefolder)
    execSync(`mkdir ${cachefolder}`)
}

let audiofifopath = `/tmp/audiofifo_librespot_${settings.audioSourceDisplayName}`

if (fs.existsSync(audiofifopath)) {
    console.log('audiofifo exists', audiofifopath)
} else {
    console.log('audiofifo does not exist', audiofifopath)
    execSync(`mkfifo ${audiofifopath}`)
}

let stateInactiveCheckPointer = false
let readFuncIntervalPointer = false
let sinkErrorReportPointer = false

function stateInactiveCheck() {
    captureState = 'idle'
    if (readFuncIntervalPointer) {
        clearInterval(readFuncIntervalPointer)
        readFuncIntervalPointer = false
    }
    if (sinkErrorReportPointer) {
        clearInterval(sinkErrorReportPointer)
        sinkErrorReportPointer = false
    }

    common.setPriority(process.pid, -19)
    common.setPriority(librespot.pid, -19)
}

function spawnlibrespot() {

    console.log('starting librespot')
    try { execSync(` rm ${cachefolder}/credentials.json`) }
    catch (error) { }

    librespot = spawn(`/usr/local/bin/librespot`, ['-v', '-n', settings.audioSourceDisplayName, '-b', '320', '-c', `${cachefolder}`, '--enable-volume-normalisation', '--backend', 'pipe', '--device', `${audiofifopath}`]);
    librespot.stdout.on('data', (data) => {
        console.log('librespot', String(data))
    });
    librespot.stderr.on('data', (data) => {
        //console.error('librespot', String(data))
        message = String(data)

        if (message.includes('== Starting sink ==')) {
            console.log('== Starting sink ==')
            if (stateInactiveCheckPointer) {
                clearTimeout(stateInactiveCheckPointer)
                stateInactiveCheckPointer = false
            }
            captureState = 'active'
            common.setPriority(process.pid, 80)
            common.setPriority(librespot.pid, 80)
            readFuncIntervalPointer = setInterval(readFunc, Math.floor(reported_period_time * 0.75))

            if (!sinkErrorReportPointer) {
                sinkErrorReportPointer = setInterval(sinkErrorReport, 1000)
            }
        }

        if (message.includes('== Stopping sink ==')) {
            console.log('== Stopping sink ==')
            stateInactiveCheckPointer = setTimeout(stateInactiveCheck, 5000)
        }

        if (message.includes('spotify volume:')) {
            let librespot_volume = message.slice(message.lastIndexOf('spotify volume:') + 15, message.lastIndexOf('\n') + 1)
            librespot_volume = librespot_volume.slice(0, librespot_volume.indexOf('\n'))
            librespot_volume = Number(librespot_volume)
            let librespot_db_volume = (settings.volume_db_min - settings.volume_db_max) / (settings.volume_librespot_min - settings.volume_librespot_max) * (librespot_volume - settings.volume_librespot_min) + settings.volume_db_min

            console.log('Librespot Volume ///////////////////////////', librespot_volume, librespot_db_volume)

            if (highVolumeLimit) {
                if (librespot_db_volume <= -20) {
                    highVolumeLimit = false
                } else {
                    librespot_db_volume = -20
                    console.log('Volume Override', librespot_db_volume)
                }
            }
            volumeOut = librespot_db_volume
            buffertoudp.sendStatusUpdatetoSink()
        }

        if (message.includes('Shutting down player thread')) {
            console.log('found text Shutting down player thread, restarting librespot')
            process.exit()
        }
    });
    librespot.on('close', (code) => {
        console.log('librespot', 'close', String(code))
        console.log('hello exit start')
        console.log('process.pid', process.pid)
        execSync(`sudo systemctl restart smartsoundsyncspotify${settings.audioSourceDisplayName}.service`)
        //process.exit()
        console.log('hello after exit start')
        //setTimeout(spawnlibrespot, 2000)
    });

}


var readStream = fs.createReadStream(`${audiofifopath}`);
var sendTime = 0
var lastData = 0
var sampleIndex = 0


let captureStateLast = 'init'


let timeAdjust = 0



let syncErrorAverageAll = 0
let syncErrorAverageAllLast = 0
let syncErrorDiff = 0


function readFunc() {

    //console.log('hello')
    if (captureState == 'active' && (sendTime < (Date.now() + desired_playback_delay) || sendTime == 0)) {
        audioData = readStream.read(reported_period_size * 4)

        if (audioData == null) {
            console.log('is null')
            audioData = Buffer.alloc(reported_period_size * 4);
        }

        if (audioData.length != reported_period_size * 4) {
            console.log('size different!!!!!!!!!!!!!!!!!!!!', audioData.length / 4)
        }

        if (sendTime == 0 || sendTime < (Date.now() - desired_playback_delay)) {
            console.log('SEND TIME RESET!!!!!', sendTime, (Date.now() - desired_playback_delay), sendTime - (Date.now() - desired_playback_delay))
            sendTime = Date.now() // reset sendTime if it get's too far behind, typically due to pause or first scan.  
        }
        buffertoudp.sendAudioUDP(audioData, sendTime, sampleIndex)

        //console.log(ntpCorrection, reported_period_time,  reported_period_time - (reported_period_time / ntpCorrection))
        sendTime = sendTime + (reported_period_time * ntpCorrection)
        sampleIndex = sampleIndex + 1
        lastData = Date.now()
    }

    //   if (sendTime == 0 || sendTime < (Date.now() - source_buffer_time * 20)) {
    //       captureState = 'idle'
    //   } else {
    //       captureState = 'active'
    //   }

    if (captureState != captureStateLast) {
        buffertoudp.sendStatusUpdatetoControl()
        console.log('captureState now: ', captureState)
        captureStateLast = captureState
    }
}

spawnlibrespot()

console.log('read time interval', Math.floor(reported_period_time * 0.75))

buffertoudp.syncErrorData.on("syncErrorData", function (data) {
    buffertoudp.audioSinkList.forEach(function (value, index) {
        if (
            data.hostname == value.hostname
            &&
            data.port == value.port
        ) {
            if (!value.sampleAdjustSource) { value.sampleAdjustSource = 0 }
            value.sampleAdjustSource = value.sampleAdjustSource + data.sampleAdjustSource
        }
    })
});

let avgErr = 0

function sinkErrorReport() {
    console.log('-')
    buffertoudp.audioSinkList.forEach(function (value, index) {
        console.log(value.hostname, value.sampleAdjustSource)
        avgErr = avgErr + value.sampleAdjustSource
        value.sampleAdjustSource = 0
    })
    if (buffertoudp.audioSinkList.length > 0) {
        avgErr = avgErr / buffertoudp.audioSinkList.length
        console.log('average', avgErr)
        sendTime = sendTime - (avgErr * sampleTimeMS)
        avgErr = 0
    }
}
