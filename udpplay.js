"use strict";

global.common = require('./common.js')
const { exec, spawn, execSync } = require('child_process');
const fs = require('fs');
const { settings } = require('cluster');

//const { settings } = require('cluster');


let ecasoundPID

function killEcasound() {
    try {

        ecasoundPID = String(execSync(`pidof ecasound`))
        ecasoundPID = ecasoundPID.split(' ')

        ecasoundPID.forEach(function (value, index) {
            value = Number(value.replace('\n', ''))

            console.log(value)
            try {
                execSync(`sudo kill -9 ${value}`)
                console.log('kill ecasound pid succeeded', value)
            }
            catch (e) {
                console.log('kill ecasound pid failed', value)
            }

        })
    }

    catch (e) {
        console.log('ecasound was not running')
    }
}

function killUDPPlay() {
    killEcasound()
    process.exit()
}

let average = (array) => array.reduce((a, b) => a + b) / array.length;

killEcasound()

function killPCM() {

    try {
        execSync(`pkill pcm`)
        console.log('pcm was running')
    }

    catch (e) {
        console.log('pcm was not running')
    }
}

//export LADSPA_PATH=/usr/local/lib/ladspa:/usr/lib/ladspa;



var localSettings = {
    processPriority: 85,
    verbose: false,
    outputChannels: 2,
    playback_buffer_periods: 4,
    mono: false,
}

settings = { ...settings, ...localSettings }

var cmdlineSTR = String(process.argv)
var cmdSettingsJSON = cmdlineSTR.slice(cmdlineSTR.lastIndexOf('{'), cmdlineSTR.lastIndexOf('}') + 1)

if (cmdSettingsJSON != 0) {
    var cmdSettingsObj = JSON.parse(String(cmdSettingsJSON))
    settings = { ...settings, ...cmdSettingsObj }
}

if (!settings.hostnameForMatch) {
    settings.hostnameForMatch = settings.controllerHostname
}

let volume

if (settings.volumeControlScript) {
    volume = require(settings.volumeControlScript);
} else {
    volume = require(`./volume.js`);
}

global.volumeOut = settings.volume_db_min
volume.set_volume(volumeOut)

const outputbytesPerSample = settings.bytesPerSample * settings.outputChannels
const sourcebytesPerSample = settings.bytesPerSample * settings.source_channels

common.setPriority(process.pid, 98)

var socketControl = dgram.createSocket({ type: "udp4", reuseAddr: true });

socketControl.on('listening', () => {
    const address = socketControl.address();
    console.log(`socketControl listening ${address.address}:${address.port}`);
    setInterval(sendSubscribe, 2000)
});

var newSource = false
var selectedSource = false

let connectedController

socketControl.on('message', function (messageControl, remote) {
    let messageControlObj = JSON.parse(String(messageControl))

    if (messageControlObj.type == 'playback selection') {

        //console.log(messageControlObj)

        if (messageControlObj.hostname != connectedController) {
            connectedController = messageControlObj.hostname
            console.log('Connected to controller', connectedController)
        }

        newSource = messageControlObj.playback

        if (newSource && selectedSource &&
            (
                newSource.hostname != selectedSource.hostname ||
                newSource.audioPort != selectedSource.audioPort ||
                (newSource.captureState == 'idle' && selectedSource.captureState != 'idle')
            )
        ) {
            console.log('controller playback source changed, restarting')
            killUDPPlay()
        }

        if (!newSource && selectedSource) {
            console.log('controller playback source stopped, restarting')
            killUDPPlay()
        }

        selectedSource = JSON.parse(JSON.stringify(newSource));

        if (selectedSource) {
            //audioConnectRequest()
        }

    }
})



function sendSubscribe() {
    var statusObject = {
        type: 'Sink Subscribe',
        hostname: hostname,
        hostnameForMatch: settings.hostnameForMatch,
        port: socketControl.address().port
    }

    let statusBuffer = Buffer.from(JSON.stringify(statusObject))
    socketControl.send(statusBuffer, 0, statusBuffer.length, settings.controllerPort, settings.controllerHostname, function (err, bytes) {
        if (err) throw err;
    });
}

var socketAudio = null

socketAudio = dgram.createSocket({ type: "udp4", reuseAddr: true });

socketAudio.on('listening', () => {

    socketAudio.setRecvBufferSize(180224 * 10)

    console.log(`server listening ${socketAudio.address().address}:${socketAudio.address().port}`, 'recvbuffer', String(socketAudio.getRecvBufferSize()));
    setInterval(audioConnectRequest, 1000)
});

function audioConnectRequest() {
    if (selectedSource) {

        if (sampleAdjustSourceSum > 2) {
            console.log('clamp high', sampleAdjustSourceSum)
            sampleAdjustSourceSum = 2            
        }
        if (sampleAdjustSourceSum < -2) {
            console.log('clamp low', sampleAdjustSourceSum)
            sampleAdjustSourceSum = -2            
        }

        sampleAdjustSourceSumLast = sampleAdjustSourceSum

        let connectObj = {
            type: 'connectRequest',
            hostname: os.hostname(),
            port: socketAudio.address().port,
            syncError: sampleAdjustSourceSum
        }
        sampleAdjustSourceSum = 0
        let connectRequestBuffer = Buffer.from(JSON.stringify(connectObj))
        connectRequestBuffer = Buffer.concat([messageTypeJSON, connectRequestBuffer])
        socketAudio.send(connectRequestBuffer, 0, connectRequestBuffer.length, selectedSource.audioPort, selectedSource.hostname, function (err, bytes) {
            if (err) throw err;
        });
    }
}

var framesList = new Object();

let receiveIndex = 0
let ecasoundIndex = 0
let ecasoundIndexLast = 0
let lowestEccasoundlast = 0
let ecasoundWaitCount = 0

function sendEccasound() {
    if (ecasoundIndex == 0) {
        let lowestEccasound = 0
        let frameName
        for (frameName in framesList) {
            let frame = framesList[frameName]

            if (
                frame &&
                (lowestEccasound == 0 || frame.dataIndex < lowestEccasound) &&
                !frame.ecasoundChunk
            ) {
                lowestEccasound = frame.dataIndex
            }
        }

        if (lowestEccasound != 0) {
            lowestEccasoundlast = lowestEccasound
            //console.log('Index ecasoundinlength', lowestEccasound, framesList[lowestEccasound.toString()].audioChunk.length / sourcebytesPerSample)
            ecasound.stdin.write(framesList[lowestEccasound.toString()].audioChunk)
            ecasoundIndex = lowestEccasound
        }
    } {
        ecasoundWaitCount = ecasoundWaitCount + 1
        if (ecasoundWaitCount > 50) {
            console.log('reseting ecasoundIndex!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
            ecasoundIndex = 0
            ecasoundWaitCount = 0
        }
    }
}

var sourceObj
var sourceObjLast

var aplay = false

socketAudio.on('message', function (message, remote) {

    let messageType = String(message.slice(0, 10))
    let messageHostname = String(message.slice(10, 30))

    messageHostname = messageHostname.trim()

    if (messageHostname == selectedSource.hostname && selectedSource.audioPort == remote.port) {

        message = message.slice(30)

        if (messageType == messageTypeAudio) {
            let frameObject = {
                dataTime: message.readDoubleLE(0),
                dataIndex: message.readDoubleLE(8),
                audioChunk: message.slice(16)
            }

            //console.log('Received', frameObject.dataTime - Date.now())

            receiveIndex = frameObject.dataIndex
            framesList[frameObject.dataIndex.toString()] = Object.assign({}, frameObject);

            let frameName
            for (frameName in framesList) {
                let frame = framesList[frameName]
                if (frame.dataIndex < syncIndex || Date.now() - frame.dataTime > sourceObj.desired_playback_delay) {
                    console.log('discarding', frame.dataIndex, 'syncIndex', syncIndex, 'age', Date.now() - frame.dataTime, Date.now(), frame.dataTime, Object.keys(framesList).length)
                    delete framesList[frame.dataIndex.toString()]
                }
            }
            if (ecasoundReady) {
                sendEccasound()
            }
        }

        if (messageType == messageTypeJSON) {
            let messageObj = JSON.parse(String(message))

            if (messageObj.type == 'Setup') {

                sourceObj = messageObj



                //sourceObj.buffer_size = sourceObj.period_size * 4

                if (volumeOut != sourceObj.volumeOut) {
                    volumeOut = sourceObj.volumeOut
                    volume.set_volume(volumeOut)
                }

                if (sourceObjLast &&
                    (
                        sourceObjLast.rate != sourceObj.rate ||
                        sourceObjLast.period_size != sourceObj.period_size ||
                        sourceObjLast.channels != sourceObj.channels ||
                        sourceObjLast.buffer_size != sourceObj.buffer_size
                    )
                ) {
                    console.log('setup data changed restarting UDPplay')
                    killUDPPlay()
                }

                if (!sourceObjLast) {
                    spawnecasound()
                }

                sourceObjLast = JSON.parse(JSON.stringify(sourceObj));
            }
        }
    }
});


var sampleTimeMS = 0

var reported_exact_rate = 0
var reported_buffer_size = 0
var reported_period_size = 0
var reported_period_time = 0

var samples_per_ms
var reportedBufferMS = 0

var reportedFound = false

let positiveLimit
let negativeLimit
let transmitSize = 0



function processAplayStderr(stderr) {

    let message = String(stderr)

    console.error('aplay', message)

    if (!reportedFound) {

        let testStr = 'Rate: '
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
            samples_per_ms = reported_exact_rate / 1000
            sampleTimeMS = 1 / reported_exact_rate * 1000

            positiveLimit = reported_period_time * 1
            negativeLimit = reported_period_time * 0

            reportedBufferMS = reported_buffer_size / reported_period_size * reported_period_time

            //transmitSize = Math.floor(reported_period_size / 4)

            console.log(
                '\n',
                'aplay setup data', '\n',
                'reported_exact_rate', reported_exact_rate, '\n',
                'reported_buffer_size', reported_buffer_size, '\n',
                'reported_period_size', reported_period_size, '\n',
                'reported_period_time', reported_period_time, '\n',
                'reportedBufferMS', reportedBufferMS, '\n',
                'samples_per_ms', samples_per_ms, '\n',
                'sampleTimeMS', sampleTimeMS
            )
        }
    }

    if (message.includes('XRUN')) {
        console.log('XRUN FOUND')
        killUDPPlay()
    }
}

function aplayInit() {
    let initbuffer = Buffer.alloc(sourceObj.playback_buffer_size * outputbytesPerSample);
    console.log('INIT LENGTH', initbuffer.length / outputbytesPerSample)
    aplay.stdin.write(initbuffer)
}

var read
var written
var triggerhtstamp
var htstamp
var avail
var delay
var state
var cardTimeht

function processStatus(data) {

    let testStr = 'Read: '
    if (data.includes(testStr)) {
        read = data.slice(data.lastIndexOf(testStr) + testStr.length)
        read = Number(read.slice(0, read.indexOf(' ')))
    }

    testStr = 'Written: '
    if (data.includes(testStr)) {
        written = data.slice(data.lastIndexOf(testStr) + testStr.length)
        written = Number(written.slice(0, written.indexOf(' ')))
    }

    testStr = 'Trigger: '
    if (data.includes(testStr)) {
        triggerhtstamp = data.slice(data.lastIndexOf(testStr) + testStr.length)
        triggerhtstamp = Number(triggerhtstamp.slice(0, triggerhtstamp.indexOf(' '))) * 1000
    }

    testStr = 'htstamp: '
    if (data.includes(testStr)) {
        htstamp = data.slice(data.lastIndexOf(testStr) + testStr.length)
        let htstampSTR = htstamp.slice(0, htstamp.indexOf(' '))
        htstamp = Number(htstampSTR) * 1000
    }

    testStr = 'Avail: '
    if (data.includes(testStr)) {
        avail = data.slice(data.lastIndexOf(testStr) + testStr.length)
        avail = Number(avail.slice(0, avail.indexOf(' ')))
    }

    testStr = 'Delay: '
    if (data.includes(testStr)) {
        delay = data.slice(data.lastIndexOf(testStr) + testStr.length)
        delay = Number(delay.slice(0, delay.indexOf(' ')))
    }

    testStr = 'State: '
    if (data.includes(testStr)) {
        state = data.slice(data.lastIndexOf(testStr) + testStr.length)
        state = String(state.slice(0, state.indexOf(' ')))
    }
    //console.log('Data Request', 'Read', read, 'written', written, 'Trigger', triggerhtstamp, 'htstamp', htstamp, 'avail', avail, 'delay', delay, 'state', state)

    cardTimeht = htstamp + (delay * sampleTimeMS) - sourceObj.desired_playback_delay
    aplayReady = true
}

var pcmPID
var aplayReady = false

async function spawnaplay() {

    console.log(sourceObj)

    console.log('Playback Setup Data', settings.cardName, sourceObj.reported_exact_rate, settings.outputChannels, sourceObj.playback_period_size, sourceObj.playback_buffer_size)
    console.log(process.cwd(), '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!11111111')


    let teststr = `stdbuf -i0 -o0 -e0 /usr/local/bin/pcm ${settings.cardName} ${sourceObj.reported_exact_rate} ${settings.outputChannels} ${sourceObj.playback_period_size} ${sourceObj.playback_buffer_size}`

    aplay = spawn("/bin/sh", ["-c", teststr])

    aplay.stdout.on('data', (data) => {

        if (data.includes('Read:')) {
            processStatus(data)
            sendData()

        } else {
            console.log('whats this??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????//')
            console.log('aplay', String(data))
        }
    });
    aplay.stderr.on('data', (data) => {
        processAplayStderr(data)
    });
    aplay.on('close', (code) => {
        console.error('aplay closed restarting UDPplay', code)
        killUDPPlay()
    });

    aplayInit()

    pcmPID = Number(execSync(`pidof pcm`))

    console.log('pcmPID:', pcmPID)

    common.setPriority(pcmPID, 99)
}
var sampleAdjustSinkTotal = 0

let syncIndex = 0
let sampleAdjustSink = 0
var sampleAdjustSinkTotalABS = 0
var sampleTotal = 0
let audiobuffferTime = 0

let syncErrorMS = 0
let sinkErrorSamples = 0
var sinkErrorSamplesAverage = 0
var sinkErrorSamplesArray = []
var sinkErrorSamplesAverageSeconds = 1
var sinkErrorSamplesArrayLengthSetpoint = Math.round(44100 / 128 * sinkErrorSamplesAverageSeconds)

var sampleAdjustSinkStartSeconds = 2
var sampleAdjustSinkStartSecondsSetpoint = Math.round(44100 / 128 * sampleAdjustSinkStartSeconds)

let sampleAdjustSource = 0
let sampleAdjustSourceSum = 0
let sampleAdjustSourceSumLast = 0
let sourceErrorSamples = 0
var sourceErrorSamplesAverage = 0
var sourceErrorSamplesArray = []
var sourceErrorSamplesAverageSeconds = 1
var sourceErrorSamplesArrayLengthSetpoint = Math.round(44100 / 128 * sourceErrorSamplesAverageSeconds)

var sampleAdjustSourceStartSeconds = 2
var sampleAdjustSourceStartSecondsSetpoint = Math.round(44100 / 128 * sampleAdjustSourceStartSeconds)

var syncErrorMSamplesAverage = 0
var syncErrorMSamplesArray = []

var syncErrorMSamplesAverageSeconds = 1
var syncErrorMSamplesArrayLengthSetpoint = Math.round(44100 / 128 * syncErrorMSamplesAverageSeconds)

function syncErrorresetAverage() {
    sinkErrorSamplesArray = []
}

let cardTimehtLast = 0
let syncIndexWritten = 0

var audiobuffer = Buffer.alloc(0)

function getData() {

    if (audiobuffer.length / outputbytesPerSample < transmitSize) {
        if (syncIndex == 0) {
            let syncErrorFind = 0
            let frameName
            for (frameName in framesList) {

                let frame = framesList[frameName]
                syncErrorFind = cardTimeht - frame.dataTime

                if (syncErrorFind < positiveLimit && syncErrorFind > negativeLimit) {
                    syncIndex = frame.dataIndex
                    console.log("found sync at", syncIndex, "with error", syncErrorFind)

                    let frameName
                    for (frameName in framesList) {
                        let frame = framesList[frameName]
                        if (frame.dataIndex < syncIndex || Date.now() - frame.dataTime > sourceObj.desired_playback_delay) {
                            console.log('discarding2', frame.dataIndex, 'syncIndex', syncIndex, 'age', Date.now() - frame.dataTime, Date.now(), frame.dataTime)
                            delete framesList[frame.dataIndex.toString()]
                        }
                    }
                }
            }
            if (syncErrorFind == 0) {
                console.log("Sync not found !!!!!!!!!!!!!!!!1")
            }
        }

        if (syncIndex != 0) {
            let frame = framesList[syncIndex.toString()]
            if (frame) {

                //console.log(frame)
                if (frame.ecasoundChunk) {

                    //console.log('Index frame.ecasoundChunk.length', syncIndex, frame.ecasoundChunk.length / outputbytesPerSample)

                    audiobuffferTime = frame.dataTime - (audiobuffer.length / outputbytesPerSample * sampleTimeMS)
                    audiobuffer = Buffer.concat([audiobuffer, frame.ecasoundChunk])

                    delete framesList[syncIndex.toString()]
                    syncIndexWritten = syncIndex
                    syncIndex = syncIndex + 1
                } else {
                    console.log("ecasound data for ", syncIndex, "not found", 'ecasoundIndex', ecasoundIndex, 'lowestEccasound', lowestEccasoundlast)
                    syncIndex = 0
                }

            } else {
                console.log("frame", syncIndex, "not found")
                syncIndex = 0
            }
        }
    }
}

let samples_since_correct = 0

function numberFormat(x) {
    return Number.parseFloat(x).toFixed(3);
}

function sendData() {

    transmitSize = avail

    samples_since_correct = samples_since_correct + written

    getData()
    syncErrorMS = cardTimeht - audiobuffferTime

    if (syncIndex != 0) {

        sampleTotal = sampleTotal + written

        //syncErrorA

        sinkErrorSamples = Math.floor(Math.abs(syncErrorMS / (sampleTimeMS)))
        if (syncErrorMS < 0) { sinkErrorSamples = sinkErrorSamples * -1 }

        if (sinkErrorSamplesArray.push(sinkErrorSamples) > sinkErrorSamplesArrayLengthSetpoint) {
            sinkErrorSamplesArray.shift()
        }
        sinkErrorSamplesAverage = average(sinkErrorSamplesArray)

        sampleAdjustSink = 0
        if (sampleTotal / 128 >= sampleAdjustSinkStartSecondsSetpoint) {
            sampleAdjustSink = Math.floor(Math.abs(sinkErrorSamplesAverage))

            //console.log(sourceObj.sourceSampleAdjust)
            if (sampleAdjustSink < sourceObj.sourceSampleAdjust) { sampleAdjustSink = 0 }
            if (sampleAdjustSink >= sourceObj.sourceSampleAdjust && sourceObj.sourceSampleAdjust != 0) { sampleAdjustSink = sampleAdjustSink - 1 }

            if (sinkErrorSamplesAverage > 0) { sampleAdjustSink = sampleAdjustSink * -1 }
        }

        if (sampleAdjustSink != 0) {
            sinkErrorSamplesArray.forEach(function (value, index) {
                sinkErrorSamplesArray[index] = sinkErrorSamplesArray[index] + sampleAdjustSink
            })
        }

        //syncErrorB

        if (sourceObj.sourceSampleAdjust != 0) {

            sourceErrorSamples = Math.floor(Math.abs(syncErrorMS / sampleTimeMS))
            if (syncErrorMS < 0) { sourceErrorSamples = sourceErrorSamples * -1 }

            if (sourceErrorSamplesArray.push(sourceErrorSamples) > sourceErrorSamplesArrayLengthSetpoint) {
                sourceErrorSamplesArray.shift()
            }
            sourceErrorSamplesAverage = average(sourceErrorSamplesArray)

            sampleAdjustSource = 0
            if (sampleTotal / 128 >= sampleAdjustSourceStartSecondsSetpoint) {
                sampleAdjustSource = Math.floor(Math.abs(sourceErrorSamplesAverage))
                //if (sampleAdjustSource > 1) { sampleAdjustSource = 1 }
                if (sourceErrorSamplesAverage > 0) { sampleAdjustSource = sampleAdjustSource * -1 }
            }

            if (sampleAdjustSource != 0) {
                sourceErrorSamplesArray.forEach(function (value, index) {
                    sourceErrorSamplesArray[index] = sourceErrorSamplesArray[index] + sampleAdjustSource
                })
            }

            sampleAdjustSourceSum = sampleAdjustSourceSum + sampleAdjustSource
        }

        //syncErrorM

        if (syncErrorMSamplesArray.push(sinkErrorSamples) > syncErrorMSamplesArrayLengthSetpoint) {
            syncErrorMSamplesArray.shift()
        }
        syncErrorMSamplesAverage = average(syncErrorMSamplesArray)



        sampleAdjustSinkTotal = sampleAdjustSinkTotal + sampleAdjustSink
        sampleAdjustSinkTotalABS = sampleAdjustSinkTotalABS + Math.abs(sampleAdjustSink)


        if (sampleAdjustSink > audiobuffer.length / outputbytesPerSample) { sampleAdjustSink = audiobuffer.length / outputbytesPerSample }
        if (sampleAdjustSink < audiobuffer.length / outputbytesPerSample * -1) { sampleAdjustSink = audiobuffer.length / outputbytesPerSample * -1 }

        let sampleAdjustSinkMS = sampleAdjustSink * sampleTimeMS

        if (sampleAdjustSink < 0) {
            audiobuffer = audiobuffer.slice(sampleAdjustSink * outputbytesPerSample * -1);
            audiobuffferTime = audiobuffferTime + sampleAdjustSinkMS
        }

        if (sampleAdjustSink > 0) {
            let padBuffer = Buffer.alloc(sampleAdjustSink * outputbytesPerSample);
            audiobuffer = Buffer.concat([audiobuffer, padBuffer])
            audiobuffferTime = audiobuffferTime + sampleAdjustSinkMS
        }

        getData()

    } else {

        sampleAdjustSink = 0
        syncErrorresetAverage()

    }

    let shortData = transmitSize - Math.floor(audiobuffer.length / outputbytesPerSample)

    if (shortData > 0) {
        console.log('Inserting SILENCE samples:', shortData, 'audiobuffer', Math.floor(audiobuffer.length / outputbytesPerSample), 'avail', avail)

        let shortDataBuffer = Buffer.alloc(shortData * outputbytesPerSample);
        audiobuffer = Buffer.concat([audiobuffer, shortDataBuffer])
        audiobuffferTime = audiobuffferTime + (shortData * sampleTimeMS)
    }

    let sentlength = 0
    if (audiobuffer.length / outputbytesPerSample >= transmitSize) {
        let sendbuffer = audiobuffer.slice(0, transmitSize * outputbytesPerSample)

        audiobuffer = audiobuffer.slice(sendbuffer.length);

        audiobuffferTime = audiobuffferTime + (transmitSize * sampleTimeMS)

        aplay.stdin.write(sendbuffer)

        sentlength = sendbuffer.length / outputbytesPerSample

    } else {
        console.log('SHORTDATAERROR!!!')
    }

    if (settings.verbose || sampleAdjustSink != 0 || sampleAdjustSourceSumLast != 0 || avail > delay) {

        console.log(
            'frames', pad(2, String(Object.keys(framesList).length), ' '),
            //'receiveIndex', pad(10, String(receiveIndex), ' '),
            //'ecasoundIndex', pad(10, String(ecasoundIndexLast), ' '),
            'writeIndex', pad(10, String(syncIndexWritten), ' '),
            //'last read', pad(4, String(read), ' '),
            //'last written', pad(4, String(written), ' '),
            //'sent', pad(4, String(sentlength), ' '),
            'avail', pad(4, String(avail), ' '),
            'delay', pad(4, String(delay), ' '),

            'audiobuffer', pad(5, String(audiobuffer.length / outputbytesPerSample), ' '),
            //'abtime', audiobuffferTime,


            //  'cardTimePeriod', pad(String((cardTimeht - cardTimehtLast) / written), 22, ' '),

            //'SinkErr', pad(String(numberFormat(sinkErrorSamplesAverage)), 6, ' '),
            //'SourceErr', pad(String(numberFormat(sourceErrorSamplesAverage)), 6, ' '),
            'Err', pad(String(numberFormat(syncErrorMSamplesAverage)), 6, ' '),

            'AdjustSink', pad(String(sampleAdjustSink), 4, ' '),
            'AdjustSource', pad(String(sampleAdjustSourceSumLast), 4, ' '),

            

            'AdjTotal', pad(6, String(sampleAdjustSinkTotal), ' '),
            'AdjTotalABS', pad(6, String(sampleAdjustSinkTotalABS), ' '),
            //'SampleTotal', pad(String(sampleTotal), 10, ' '),
            'SinceAdj', pad(10, String(samples_since_correct), ' ')
        )
        sampleAdjustSourceSumLast = 0
        ecasoundIndexLast = 0
        receiveIndex = 0
    }

    if (sampleAdjustSink != 0) {
        samples_since_correct = 0
    }

    cardTimehtLast = cardTimeht

}


function numberpad(number) {
    number = Math.round(number)
    let numberString = String(number)
    if (number <= 0) {
        numberString = ` ${numberString}`
    }

    numberString = numberString.padStart(10, ' ')
    return numberString
}

var ecasound
var ecasoundReady = false

async function spawnecasound() {




    console.log('here goes ecasound')

    //execSync(`export LADSPA_PATH=/usr/local/lib/ladspa:/usr/lib/ladspa`)

    let ecasoundBufferSize = sourceObj.reported_period_size

    let maxEcasoundBuffer = 99999999999999999

    if (ecasoundBufferSize > maxEcasoundBuffer) {
        ecasoundBufferSize = maxEcasoundBuffer
    }

    let ecasoundCommand = `export LADSPA_PATH=/usr/local/lib/ladspa:/usr/lib/ladspa; stdbuf -i0 -o0 -e0 ecasound -B:rt -z:nodb -b:${ecasoundBufferSize} -f:16,2,44100 -i stdin`

    let ecasoundChainSetup = fs.readFileSync('/usr/local/etc/smartsoundsync/ecasound/chainsetup-file.ecs', 'utf8')

    let ecasoundOutputSetup = `-f:s16_le,${settings.outputChannels},44100 -o:stdout`

    ecasoundCommand = ecasoundCommand.concat(" ", ecasoundChainSetup, " ", ecasoundOutputSetup)

    console.log("ecasound Command: ", ecasoundCommand)

    ecasound = spawn("/bin/sh", ["-c", ecasoundCommand])

    ecasound.stdout.on('data', (data) => {
        //console.log('Index ecasoundoutlength', ecasoundIndex, data.length / outputbytesPerSample)
        if (framesList[ecasoundIndex]) {

            //let frame = framesList[ecasoundIndex]
            if (!framesList[ecasoundIndex.toString()].ecasoundChunk) {
                framesList[ecasoundIndex.toString()].ecasoundChunk = data
                //console.log(framesList[ecasoundIndex.toString()].ecasoundChunk.length / outputbytesPerSample)

            } else {
                framesList[ecasoundIndex.toString()].ecasoundChunk = Buffer.concat([framesList[ecasoundIndex.toString()].ecasoundChunk, data])
                //console.log(framesList[ecasoundIndex.toString()].ecasoundChunk.length / outputbytesPerSample)
            }

            if (framesList[ecasoundIndex.toString()].ecasoundChunk.length / outputbytesPerSample >= framesList[ecasoundIndex.toString()].audioChunk.length / sourcebytesPerSample) {

                if (framesList[ecasoundIndex.toString()].ecasoundChunk.length / outputbytesPerSample > framesList[ecasoundIndex.toString()].audioChunk.length / sourcebytesPerSample) {
                    console.log('too big!!!!!!!!!!!!!!!!!!!!!!!!!!!', framesList[ecasoundIndex.toString()].audioChunk.length / sourcebytesPerSample, framesList[ecasoundIndex.toString()].ecasoundChunk.length / outputbytesPerSample)
                }
                ecasoundIndexLast = ecasoundIndex
                ecasoundIndex = 0
                ecasoundWaitCount = 0
            }
        } else {
            console.log("Ecasound data out did not find index", ecasoundIndex)
        }
        sendEccasound()
    });

    ecasound.stderr.on('data', (data) => {

        let message = String(data)
        console.error('ecasound', message)

        if (message.includes('[* Engine - Driver start *]')) {
            ecasoundReady = true
            if (!aplay) {

                console.log('starting pcm')
                spawnaplay()
            }
        }

    });
    ecasound.on('close', (code) => {
        console.error('ecasound closed restarting UDPplay', code)
        killUDPPlay()
    });

    ecasoundPID = Number(execSync(`pidof ecasound`))

    console.log('ecasoundPID:', ecasoundPID)
    common.setPriority(ecasoundPID.pid, 90)
}

socketControl.bind(0);
socketAudio.bind(0);

module.exports = settings
