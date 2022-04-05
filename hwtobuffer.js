const { exec, spawn, execSync } = require('child_process');
//const { settings } = require('cluster');

const calc_buffer_size = settings.source_period_size * settings.source_buffer_periods

global.reported_exact_rate = 0
global.reported_buffer_size = 0
global.reported_period_size = 0
global.reported_channels = settings.source_channels
global.reported_period_time = 0
global.source_buffer_time = 0
global.playback_period_time = (1 / settings.source_rate) * 1000 * settings.playback_period_size
global.playback_buffer_size = settings.playback_period_size * settings.playback_buffer_periods
global.playback_buffer_time = playback_period_time * settings.playback_buffer_periods 
global.desired_playback_delay = 0


global.reportedFound = false
var volumeLeftLast
var volumeRightLast

var sampleTimeMS = 0

var sampleIndex = 0


let volumeCount = 0
let volumeCountOn = 2 //0.1 / (global.playback_period_time / 1000)
let volumeCountOff = -15 / (global.playback_period_time / 1000)

let restartCount = 0
let restartCountGo = (60 * 60) / (global.playback_period_time / 1000)

var sendTimeLast = 0
var htstampLast = 0
var silenceStartTime = 0
function spawnpcmRecord() {
    console.log(new Date().toISOString(), 'starting pcmRecord')

    //console.log('hello')

    //console.log(settings)

    //console.log(settings.cardName)
    pcmRecord = spawn('stdbuf', ['-i0', '-o0', '-e0', '/usr/local/bin/pcmrecord', `${settings.cardName}`, `${settings.source_rate}`, `${settings.source_channels}`, `${settings.source_period_size}`, `${calc_buffer_size}`]);
    console.log(new Date().toISOString(), 'pcmRecord started')
    pcmRecord.stdout.on('data', (chunk2) => {
        testStr = 'END\n'
        audioData = chunk2.slice(chunk2.lastIndexOf(testStr) + testStr.length)

        if (audioData.length == 0) {
            console.log(String(chunk2))
        }

        //console.log(audioData.length / 4)

        //console.log(String(chunk2.slice(0, chunk2.lastIndexOf(testStr) + testStr.length)))

        testStr = 'Read: '
        if (chunk2.includes(testStr)) {
            read = chunk2.slice(chunk2.lastIndexOf(testStr) + testStr.length)
            read = Number(read.slice(0, read.indexOf(' ')))
        }



        testStr = 'Index: '
        if (chunk2.includes(testStr)) {
            sampleIndex = chunk2.slice(chunk2.lastIndexOf(testStr) + testStr.length)
            sampleIndex = Number(sampleIndex.slice(0, sampleIndex.indexOf(' ')))
        }

        testStr = 'Trigger: '
        if (chunk2.includes(testStr)) {
            triggerhtstamp = chunk2.slice(chunk2.lastIndexOf(testStr) + testStr.length)
            triggerhtstamp = Number(triggerhtstamp.slice(0, triggerhtstamp.indexOf(' '))) * 1000
        }

        testStr = 'htstamp: '
        if (chunk2.includes(testStr)) {
            htstamp = chunk2.slice(chunk2.lastIndexOf(testStr) + testStr.length)
            htstampSTR = htstamp.slice(0, htstamp.indexOf(' '))
            htstamp = Number(htstampSTR) * 1000
        }

        testStr = 'Avail: '
        if (chunk2.includes(testStr)) {
            avail = chunk2.slice(chunk2.lastIndexOf(testStr) + testStr.length)
            avail = Number(avail.slice(0, avail.indexOf(' ')))
        }

        testStr = 'Delay: '
        if (chunk2.includes(testStr)) {
            delay = chunk2.slice(chunk2.lastIndexOf(testStr) + testStr.length)
            delay = Number(delay.slice(0, delay.indexOf(' ')))
        }

        testStr = 'State: '
        if (chunk2.includes(testStr)) {
            state = chunk2.slice(chunk2.lastIndexOf(testStr) + testStr.length)
            state = String(state.slice(0, state.indexOf(' ')))
        }


        if (reportedFound) {



            let sendTime = htstamp - (delay * sampleTimeMS) + source_buffer_time

            //console.log(audioData.length / 4, 'read', read, 'sampleIndex', sampleIndex, 'triggerhtstamp', triggerhtstamp, 'sendTime', sendTime, 'diff', sendTime - sendTimeLast, 'avail', avail, 'delay', delay, 'state', state)

            let volumeLeft = audioData.readInt16LE(0)
            let volumeRight = audioData.readInt16LE(2)

            //console.log(volumeLeft, volumeRight)

            //console.log(volumeCount, volumeCountOn, volumeCountOff, hwCaptureState, restartCount, volumeLeft, volumeRight)

            let volumeLeftDiff = Math.abs(volumeLeft - volumeLeftLast)
            let volumeRightDiff = Math.abs(volumeRight - volumeRightLast)
            let volumeDiffSilentMax = 5


            if (volumeLeftDiff <= volumeDiffSilentMax && volumeRightDiff <= volumeDiffSilentMax) {
                restartCount = restartCount + 1
                if (restartCount > restartCountGo) {
                    console.log('idle count exit!!!')
                    process.exit()
                }

                if (volumeCount > 0 || hwCaptureState == 'active') {volumeCount = volumeCount - 1}
                if (volumeCount < volumeCountOff && hwCaptureState == 'active') {
                    hwCaptureState = 'idle'
                    console.log('HWidle!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!1')
                    common.setPriority(process.pid, -19)
                    common.setPriority(pcmRecord.pid, -19)
                    volumeCount = 0
                }
                
            }
            if (volumeLeftDiff > volumeDiffSilentMax || volumeRightDiff > volumeDiffSilentMax) {
                restartCount = 0
                if (volumeCount < 0 || hwCaptureState != 'active') {volumeCount = volumeCount + 1}
                if (volumeCount > volumeCountOn && hwCaptureState != 'active') {
                    hwCaptureState = 'active'
                    common.setPriority(process.pid, 98)
                    common.setPriority(pcmRecord.pid, 99)
                    console.log('HWactive!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!1')
                    volumeCount = 0
                }
            }

            volumeLeftLast = volumeLeft
            volumeRightLast = volumeRight

            if (hwCaptureState == 'active') {
                buffertoudp.sendAudioUDP(audioData, sendTime, sampleIndex)
            }

            if (settings.verbose) {

                console.log(
                    //new Date().toISOString(),
                    state,
                    sampleIndex,
                    //'ReadLength', read,
                    'Time', pad(String(sendTime), 20, ' '),
                    'Diffh', pad(String((htstamp - htstampLast) - reported_period_time), 20, ' '),
                    'Diffs', pad(String((sendTime - sendTimeLast) - reported_period_time), 20, ' '),
                    //volumeLeft,
                    //volumeRight,
                    //'Size', pad(4, chunk.length / 4, ' '),
                    'Target - Current', pad(String(sendTime - Date.now()), 24, ' '),
                    'delay', delay,
                    //silenceStartTime,
                    //noInput
                )
            }
            sendTimeLast = sendTime
            htstampLast = htstamp
        }

    });

    pcmRecord.stderr.on('data', (data) => {
        processAplayStderr(data)
    });

    pcmRecord.on('close', (code) => {
        console.log(new Date().toISOString(), 'pcmRecord CLOSED with code ', code)
        setTimeout(spawnpcmRecord, 2000)
    });

    common.setPriority(pcmRecord.pid, 99)
}


function processAplayStderr(stderr) {
    console.log(new Date().toISOString(), 'processAplayStderr')
    console.log(new Date().toISOString(), String(stderr))
    if (!reportedFound) {

        testStr = 'Rate: '
        if (stderr.includes(testStr)) {
            reported_exact_rate = stderr.slice(stderr.lastIndexOf(testStr) + testStr.length)
            reported_exact_rate = Number(reported_exact_rate.slice(0, reported_exact_rate.indexOf('\n')))
        }

        testStr = 'Buffer Size: '
        if (stderr.includes(testStr)) {
            reported_buffer_size = stderr.slice(stderr.lastIndexOf(testStr) + testStr.length)
            reported_buffer_size = Number(reported_buffer_size.slice(0, reported_buffer_size.indexOf('\n')))
        }
        testStr = 'Period Size: '
        if (stderr.includes(testStr)) {
            reported_period_size = stderr.slice(stderr.lastIndexOf(testStr) + testStr.length)
            reported_period_size = Number(reported_period_size.slice(0, reported_period_size.indexOf('\n')))
        }
        testStr = 'Period Time: '
        if (stderr.includes(testStr)) {
            reported_period_time = stderr.slice(stderr.lastIndexOf(testStr) + testStr.length)
            reported_period_time = Number(reported_period_time.slice(0, reported_period_time.indexOf('\n'))) / 1000
        }

        if (
            reported_exact_rate != 0 &&
            reported_buffer_size != 0 &&
            reported_period_size != 0 &&
            reported_period_time != 0
        ) {
            reportedFound = true
            source_buffer_time = settings.source_buffer_periods * reported_period_time

            if (source_buffer_time > playback_buffer_time) {
                desired_playback_delay = source_buffer_time + settings.additional_requested_latency
                console.log('source buffer time', desired_playback_delay)
            } else {
                desired_playback_delay = playback_buffer_time + settings.additional_requested_latency
                console.log('playback buffer time', desired_playback_delay)
            }

            sampleTimeMS = 1 / reported_exact_rate * 1000
            console.log(
                '\n',
                'aplay setup data', '\n',
                new Date().toISOString(), '\n',
                'reported_exact_rate', reported_exact_rate, '\n',
                'reported_buffer_size', reported_buffer_size, '\n',
                'reported_period_size', reported_period_size, '\n',
                'reported_period_time', reported_period_time, '\n',
                'source_buffer_time', source_buffer_time, '\n'
            )
        }
    }
}

function checkState() {

    if (hwCaptureState != 'idle' && ((Date.now() - 9000) > htstamp)) {
        console.log('idle timeout')
        hwCaptureState = 'idle'
    }
}

setInterval(checkState, 10000)

spawnpcmRecord()



