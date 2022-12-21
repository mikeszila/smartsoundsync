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
global.desired_playback_delay = 0

let sampleTimeMS = 1 / reported_exact_rate * 1000

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

let readFuncIntervalPointer

let sinkErrorReportGoCounter = 0

function librespotCheck() {

    if (!readFuncIntervalPointer) { readFunc() }

    lastDataAge = Date.now() - lastData

    if (lastDataAge > 5000 && captureState == 'active') {
        captureState = 'idle'
        console.log('captureState is now ', captureState)
        if (readFuncIntervalPointer) {
            clearInterval(readFuncIntervalPointer)
            readFuncIntervalPointer = false
        }
        common.setPriority(process.pid, -19)
        common.setPriority(librespot.pid, -19)
        buffertoudp.sendStatusUpdatetoControl()

    }

    if (lastDataAge < 1000 && captureState != 'active') {
        captureState = 'active'
        console.log('captureState is now ', captureState)
        common.setPriority(process.pid, 99)
        common.setPriority(librespot.pid, 99)
        readFuncIntervalPointer = setInterval(readFunc, read_time_interval)
        buffertoudp.sendStatusUpdatetoControl()
    }

    if (captureState == 'active') {
        sinkErrorReportGoCounter = sinkErrorReportGoCounter + 1
        if (sinkErrorReportGoCounter >= 1) {
            sinkErrorReport()
            sinkErrorReportGoCounter = 0
        }
    }

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
        console.error('librespot', String(data))
        message = String(data)

        if (message.includes('spotify volume:')) {
            let librespot_volume = message.slice(message.lastIndexOf('spotify volume:') + 15, message.lastIndexOf('\n') + 1)
            librespot_volume = librespot_volume.slice(0, librespot_volume.indexOf('\n'))
            librespot_volume = Number(librespot_volume)
            let librespot_percent = (librespot_volume - settings.volume_librespot_min) / (settings.volume_librespot_max - settings.volume_librespot_min)
            let l2 = ((1 - librespot_percent) ** settings.volume_shape)
            let librespot_adjusted_percent = 1 - l2
            let librespot_db_volume = (settings.volume_db_max - settings.volume_db_min) * librespot_adjusted_percent + settings.volume_db_min

            //let librespot_db_volume = (settings.volume_db_min - settings.volume_db_max) / (settings.volume_librespot_min - settings.volume_librespot_max) * (librespot_volume - settings.volume_librespot_min) + settings.volume_db_min

            console.log('Librespot Volume ///////////////////////////', settings.volume_shape, librespot_percent, l2, librespot_adjusted_percent, librespot_volume, librespot_db_volume)

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
var sendTimeAdjust = 0
var sampleIndex = 0
var lastData
var lastScan
let audioDataLength = 0

function readFunc() {


    let dateNow = Date.now()

    if ((captureState == 'active') && ((dateNow - lastScan) > reported_period_time)) { console.log('long scan time:', dateNow - lastScan, 'period time:', reported_period_time, 'read interval:', read_time_interval) }
    lastScan = dateNow

    //console.log('hello')
    if (((dateNow - sendTime + reported_period_time + source_buffer_time) > 0)) {
        audioData = readStream.read(reported_period_size * 4)

        if (audioData == null) {
            audioDataLength = 0
            if (captureState == 'active') { console.log('is null') }
            //audioData = Buffer.alloc(reported_period_size * 4);
        } else {
            lastData = dateNow
            audioDataLength = audioData.length / 4
            sendTime = sendTime + (reported_period_time * ntpCorrection)

            //console.log(audioDataLength)
            sampleIndex = sampleIndex + 1
            if (sendTime == 0) {
                sendTime = dateNow + reported_period_time
                console.log('Send Time INIT!!!')
            }

            if (sendTime < dateNow) {
                console.log('SEND TIME RESET!!!!!', sendTime, dateNow, sendTime - dateNow)
                sendTime = dateNow + reported_period_time // reset sendTime if it get's too far behind, typically due to pause or first scan.  
            }
            if (captureState == 'active') { buffertoudp.sendAudioUDP(audioData, sendTime, sampleIndex) }

        }
        //console.log(ntpCorrection, reported_period_time,  reported_period_time - (reported_period_time / ntpCorrection))        
    }
}

let read_time_interval = Math.floor(reported_period_time * 0.4)
console.log('read_time_interval', read_time_interval)

let sourceErrorSamples = 0
let sinkErrorSamples = 0

buffertoudp.syncErrorData.on("syncErrorData", function (data) {
    buffertoudp.audioSinkList.forEach(function (value, index) {
        if (
            data.hostname == value.hostname
            &&
            data.port == value.port
        ) {
           // console.log(data.hostname, data.sampleAdjustSink,  data.sampleAdjustSource)
            if (!value.sampleAdjustSink) { value.sampleAdjustSink = 0 }
            value.sampleAdjustSink = value.sampleAdjustSink + data.sampleAdjustSink
            sinkErrorSamples = sinkErrorSamples + (data.sampleAdjustSink / buffertoudp.audioSinkList.length)
            if (!value.sampleAdjustSource) { value.sampleAdjustSource = 0 }
            value.sampleAdjustSource = value.sampleAdjustSource + data.sampleAdjustSource
            sourceErrorSamples = sourceErrorSamples + (data.sampleAdjustSource / buffertoudp.audioSinkList.length)
            
        }
    })
});

let avgErrSink = 0
let avgErrSource = 0


function numberFormat(x, decimalLength) {
    let returnNumber = String(Number.parseFloat(x).toFixed(decimalLength))

    if (x >= 0) {
        returnNumber = " " + returnNumber
    }
    
    return returnNumber
}

function sinkErrorReport() {
    //console.log('-')

    let errordata = ""
    errordata = errordata.concat("ERR: ")
    buffertoudp.audioSinkList.forEach(function (value, index) {
        //console.log(value.hostname, value.sampleAdjustSource)
        if (!value.sampleAdjustSink) { value.sampleAdjustSink = 0 }
        if (!value.sampleAdjustSource) { value.sampleAdjustSource = 0 }

        errordata = errordata.concat(value.hostname)
        errordata = errordata.concat(":")
        //errordata = errordata.concat(pad(value.sampleAdjustSource, 4, " "))
        errordata = errordata.concat(pad(String(numberFormat(value.sampleAdjustSink, 0)), 2, ' '))
        errordata = errordata.concat(',')
        errordata = errordata.concat(pad(String(numberFormat(value.sampleAdjustSource, 1)), 4, ' '))
 
        avgErrSink = avgErrSink + value.sampleAdjustSink
        value.sampleAdjustSink = 0
        avgErrSource = avgErrSource + value.sampleAdjustSource
        value.sampleAdjustSource = 0
    })
    if (buffertoudp.audioSinkList.length > 0) {
        avgErrSink = avgErrSink / buffertoudp.audioSinkList.length
        avgErrSource = avgErrSource / buffertoudp.audioSinkList.length
        errordata = errordata.concat("AVG: ")
        //errordata = errordata.concat(avgErr)
        errordata = errordata.concat(pad(String(numberFormat(avgErrSink, 3)), 6, ' '))
        errordata = errordata.concat(',')
        errordata = errordata.concat(pad(String(numberFormat(avgErrSource, 3)), 6, ' '))
        //console.log('average', avgErr)
        //sendTimeAdjust = avgErr * sampleTimeMS

        //errordata = errordata.concat(" msADJ: ")
        //errordata = errordata.concat(pad(String(numberFormat(sendTimeAdjust, 3)), 6, ' '))

        //sendTime = sendTime - sendTimeAdjust
        //errordata = errordata.concat(" sendTIme: ")
        //errordata = errordata.concat(sendTime)
        avgErrSink = 0
        avgErrSource = 0
        console.log(errordata)
    }
    
}

spawnlibrespot()
setInterval(librespotCheck, 500)
