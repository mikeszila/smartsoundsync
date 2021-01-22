"use strict";


var audioSinkList = []

var socketAudio = dgram.createSocket({ type: "udp4", reuseAddr: true });
socketAudio.on('error', (err) => {
    console.log(new Date().toISOString(), `socketAudio error:\n${err.stack}`);
});

socketAudio.bind(0);

socketAudio.on('listening', () => {
    let address = socketAudio.address();
    

    socketAudio.setSendBufferSize(180224 * 10)
    console.log(new Date().toISOString(), `socketAudio listening ${address.address}:${address.port}`, 'buffer', String(socketAudio.getSendBufferSize()));
    setInterval(heartbeatsCheck, 1000)
    setupControl()
});

var EventEmitter = require('events'); 
var syncErrorData = new EventEmitter()

socketAudio.on('message', function (message, remote) {

    let messageType = String(message.slice(0, 10))
    //messageType = messageType.trim()
    message = message.slice(10)

    if (messageType == messageTypeJSON) {

        let sinkObj = JSON.parse(String(message))
        if (sinkObj.type == 'connectRequest') {



            syncErrorData.emit("syncErrorData",
                {
                    syncError: sinkObj.syncError,
                    hostname: sinkObj.hostname,
                    port: sinkObj.port
                }
            )



            let foundaudioSink = false
            audioSinkList.forEach(function (value, index) {
                if (
                    sinkObj.hostname == value.hostname &&
                    sinkObj.port == value.port &&
                    foundaudioSink == false

                ) {
                    value.lastHeartbeat = Date.now()
                    value.syncError = sinkObj.syncError
                    foundaudioSink = true
                }
            })

            if (!foundaudioSink) {
                sinkObj.address = remote.address
                sinkObj.lastHeartbeat = Date.now()
                audioSinkList.push(sinkObj);
                console.log('Adding audioSink', sinkObj.hostname, 'port', sinkObj.port, 'sink count now', audioSinkList.length)
                //console.log(audioSinkList)
            }

            let setuppbuffer = retrunsetuppbuffer()
            socketAudio.send(setuppbuffer, 0, setuppbuffer.length, sinkObj.port, sinkObj.hostname, function (err, bytes) {
                if (err) throw err;
            });
        }

        if (sinkObj.type == 'disconnectRequest') {
            audioSinkList.forEach(function (value, index) {
                if (
                    sinkObj.hostname == value.hostname &&
                    sinkObj.port == value.port
                ) {
                    console.log('Received disconnect request for audioSink', sinkObj.hostname, 'port', sinkObj.port)
                    audioSinkList.splice(index, 1)
                }
            })
        }
    }
});




function retrunsetuppbuffer() {
    let sourceObj = {
        type: 'Setup',
        reported_exact_rate: reported_exact_rate,
        reported_buffer_size: reported_buffer_size,
        reported_period_size: reported_period_size,
        reported_channels: reported_channels,
        playback_period_size: settings.playback_period_size,
        playback_buffer_size: playback_buffer_size,
        desired_playback_delay: desired_playback_delay,
        captureState: captureState,
        volumeOut: volumeOut,
        sinkCount: audioSinkList.length,
        sourceSampleAdjust: settings.sourceSampleAdjust
    }

    let setuppbuffer = Buffer.from(JSON.stringify(sourceObj))
    setuppbuffer = Buffer.concat([messageTypeJSON, messageHostname, setuppbuffer])

    return setuppbuffer
}

function sendStatusUpdatetoSink() {

    let setuppbuffer = retrunsetuppbuffer()
    audioSinkList.forEach(function (value, index) {
        socketAudio.send(setuppbuffer, 0, setuppbuffer.length, value.port, value.hostname, function (err, bytes) {
            if (err) throw err;
        });
    })
}

function sendVolume(volumeToSend) {
    volumeOut = volumeToSend
    sendStatusUpdatetoSink()
}

function heartbeatsCheck() {

    audioSinkList.forEach(function (value, index) {

        //console.log("sink", value.hostname, value.port, value.lastHeartbeat, audioSinkList.length)

        if (value.lastHeartbeat + 5000 < Date.now()) {
            audioSinkList.splice(index, 1)
            console.log('heartbeat not found for audioSink', value.hostname, 'port', value.port, 'removing', 'sink count now', audioSinkList.length)
        }
    })
}

function sendAudioUDP(audioData, sendTime, sampleIndex) {
    if (audioData.length > 0) {

        if (captureState == 'active') {

            let sendbuffer = Buffer.allocUnsafe(16);
            sendbuffer.writeDoubleLE(sendTime, 0);
            sendbuffer.writeDoubleLE(sampleIndex, 8);
            sendbuffer = Buffer.concat([messageTypeAudio, messageHostname, sendbuffer, audioData])

            if (settings.verbose) {
                console.log('Sending', sampleIndex, sendTime, audioData.length / 4, 'Sink Count', audioSinkList.length)
            }

            audioSinkList.forEach(function (value, index) {
                socketAudio.send(sendbuffer, 0, sendbuffer.length, value.port, value.hostname, function (err, bytes) {
                    if (err) throw err;
                });
            });

        }
    }
}

var socketControl = dgram.createSocket({ type: "udp4", reuseAddr: true });

let socketControlReady = false

function setupControl() {


    socketControl.on('error', (err) => {
        console.log(new Date().toISOString(), `socketControl error:\n${err.stack}`);
    });

    socketControl.on('listening', () => {
        let address = socketControl.address();
        console.log(new Date().toISOString(), `socketControl listening ${address.address}:${address.port}`);
        console.log('connecting to controller', settings.ControllerHostname, 'at port', settings.ControllerPort)
        setInterval(sendStatusUpdatetoControl, 5000)
        socketControlReady = true
    });



    socketControl.on('message', function (messageControl, remote) {
        let messageControlObj = JSON.parse(String(messageControl))

        //console.log(messageControlObj)
    })

    socketControl.bind(0);
}

function sendStatusUpdatetoControl() {
    if (socketControlReady) {
        var statusObject = {
            type: 'Source Subscribe',
            hostname: hostname,
            controlPort: socketControl.address().port,
            audioPort: socketAudio.address().port,
            audioSourceType: settings.audioSourceType,
            audioSourceDisplayName: settings.audioSourceDisplayName,
            captureState: captureState,
            volumeOut: volumeOut,
            priority: settings.setupPriority,
            audioSourceClients: settings.audioSourceClients
        }
        let statusBuffer = Buffer.from(JSON.stringify(statusObject))



        socketControl.send(statusBuffer, 0, statusBuffer.length, settings.ControllerPort, settings.ControllerHostname, function (err, bytes) {
            if (err) throw err;
        });
    }
}

module.exports = {
    sendAudioUDP,
    audioSinkList,
    socketAudio,
    sendVolume,
    sendStatusUpdatetoSink,
    sendStatusUpdatetoControl,
    syncErrorData
}