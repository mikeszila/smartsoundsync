"use strict";

const { exec, spawn, execSync } = require('child_process');
let common = require('./common.js');

var socketControlLocal = dgram.createSocket({ type: "udp4", reuseAddr: true });
var socketControlGroupClient = dgram.createSocket({ type: "udp4", reuseAddr: true });

var sourceList = []
var sinkList = []

socketControlLocal.on('error', (err) => {
    console.log(`socketControlLocal error:\n${err.stack}`);
});

socketControlLocal.on('listening', () => {
    const address = socketControlLocal.address();
    console.log(`socketControlLocal listening ${address.address}:${address.port}`);
});

socketControlGroupClient.on('error', (err) => {
    console.log(`socketControlGroupClient error:\n${err.stack}`);
});

socketControlGroupClient.on('listening', () => {
    const address = socketControlGroupClient.address();
    console.log(`socketControlGroupClient listening ${address.address}:${address.port}`);
});

socketControlLocal.on('message', function (controlMessage, remote) {

    let controlMessageObj = JSON.parse(String(controlMessage))

    if (controlMessageObj.type == 'Source Subscribe') {

        processSourceSubscribe(controlMessageObj, remote)
    }

    if (controlMessageObj.type == 'Sink Subscribe' || controlMessageObj.type == 'Control Sink Subscribe') {

        let foundSink = false
        sinkList.forEach(function (sink, index) {
            if (
                controlMessageObj.hostname == sink.hostname &&
                controlMessageObj.port == sink.port
            ) {
                sink.lastHeartbeat = Date.now()
                foundSink = true
            }
        })

        if (!foundSink) {
            console.log(controlMessageObj.type, 'Hostname:', controlMessageObj.hostname, 'controlPort:', controlMessageObj.port)
            let sink = JSON.parse(JSON.stringify(controlMessageObj))
            sink.lastHeartbeat = Date.now()
            sink.playback = false
            sink.playbackLast = false
            sinkList.push(sink);
            playbackCheck()
        }
    }
})

socketControlGroupClient.on('message', function (controlMessage, remote) {
    let controlMessageObj = JSON.parse(String(controlMessage))
    if (controlMessageObj.type == 'playback selection' && controlMessageObj.playback) {
        processSourceSubscribe(controlMessageObj.playback, remote)
    }
})

function processSourceSubscribe(controlMessageObj, remote) {
    let stateChanged = false
    let foundSource = false

    //console.log(controlMessageObj)

    sourceList.forEach(function (source, index) {

        if (
            controlMessageObj.hostname == source.hostname &&
            controlMessageObj.controlPort == source.controlPort &&
            controlMessageObj.audioPort == source.audioPort
        ) {
            foundSource = true
            if (controlMessageObj.captureState != sourceList[index].captureState) {
                stateChanged = true
            }
            let testobj2 = JSON.parse(JSON.stringify(controlMessageObj))

            sourceList[index] = { ...sourceList[index], ...testobj2 }
            sourceList[index].lastHeartbeat = Date.now()
        }
    })

    if (!foundSource) {
        console.log(
            'Source Subscribe',
            'Hostname:', controlMessageObj.hostname,
            'DisplayName:', controlMessageObj.audioSourceDisplayName,
            'controlPort:', controlMessageObj.controlPort,
            'audioPort:', controlMessageObj.audioPort,
            'audioSourceType:', controlMessageObj.audioSourceType
        )

        let testobj = JSON.parse(JSON.stringify(controlMessageObj))
        testobj.lastHeartbeat = Date.now()

        sourceList.push(testobj);
    }

    if (stateChanged || !foundSource) {
        playbackCheck()
    }
}

function playbackCheck() {

    sinkList.forEach(function (sink, index) {
        let testSource
        let highestPriority = 999999
        sourceList.forEach(function (source, index) {

            if (
                source.priority < highestPriority &&
                source.captureState == 'active' &&
                (
                    source.audioSourceClients.includes(sink.hostname) ||
                    source.audioSourceClients.includes('All') ||
                    sink.hasOwnProperty('hostnameForMatch') && source.audioSourceClients.includes(sink.hostnameForMatch)
                )
            ) {
                highestPriority = source.priority
                testSource = source
            }

        })

        if (highestPriority != 999999) {
            sink.playback = testSource

        } else {
            if (sink.playback) {
                sink.playback.captureState = 'idle'
            }
        }

        if (
            sink.playback && (
                !sink.playbackLast ||
                sink.playback.hostname != sink.playbackLast.hostname ||
                sink.playback.audioPort != sink.playbackLast.audioPort ||
                sink.playback.controlPort != sink.playbackLast.controlPort ||
                sink.playback.captureState != sink.playbackLast.captureState
            )
        ) {
            console.log(
                'Setting playback for sink',
                sink.hostname,
                sink.port,
                'to source',
                sink.playback.hostname,
                sink.playback.audioSourceDisplayName,
                sink.playback.controlPort,
                sink.playback.audioPort,
                sink.playback.audioSourceType,
                sink.playback.captureState
            )
            sink.playbackLast = JSON.parse(JSON.stringify(sink.playback));
        }

        if (!sink.playback && sink.playbackLast) {

            console.log(
                'Setting playback for sink',
                sink.hostname,
                sink.port,
                'to Idle'
            )

        }


    })
    sendStatusUpdate()
}


function sendStatusUpdate() {

    let statusObject

    sinkList.forEach(function (sink, index) {
        statusObject = {
            hostname: hostname,
            type: 'playback selection',
            playback: sink.playback
        }
        let statusBuffer = Buffer.from(JSON.stringify(statusObject))
        socketControlLocal.send(statusBuffer, 0, statusBuffer.length, sink.port, sink.hostname, function (err, bytes) {
            if (err) throw err;
        });
    })

    sourceList.forEach(function (source, index) {
        statusObject = {
            hostname: hostname,
            type: 'hello from control'
        }
        let statusBuffer = Buffer.from(JSON.stringify(statusObject))
        socketControlLocal.send(statusBuffer, 0, statusBuffer.length, source.controlPort, source.hostname, function (err, bytes) {
            if (err) throw err;
        });
    })
}

function heartbeatsCheck() {
    sourceList.forEach(function (source, index) {
        if (source.lastHeartbeat + 10000 < Date.now()) {
            console.log(
                'Heartbeat not found for Source',
                'Hostname:', source.hostname,
                'DisplayName:', source.audioSourceDisplayName,
                'controlPort:', source.controlPort,
                'audioPort:', source.audioPort,
                'audioSourceType:', source.audioSourceType,
                'removing'
            )

            sourceList.splice(index, 1)
            playbackCheck()
        }
    })

    sinkList.forEach(function (sink, index) {
        if (sink.lastHeartbeat + 10000 < Date.now()) {
            console.log('heartbeat not found for Sink', sink.hostname, 'port', sink.port, 'removing')
            sinkList.splice(index, 1)
            playbackCheck()
        }
    })
}

function sendSubscribe() {
    var statusObject = {
        type: 'Control Sink Subscribe',
        hostname: hostname,
        port: socketControlGroupClient.address().port
    }

    let statusBuffer = Buffer.from(JSON.stringify(statusObject))
    socketControlGroupClient.send(statusBuffer, 0, statusBuffer.length, settings.remoteControllerPort, settings.remoteControllerHostname, function (err, bytes) {
        if (err) throw err;
    });
}

console.log('hello!!', settings.ControllerPort)

socketControlLocal.bind(settings.ControllerPort);

if (settings.remoteControllerHostname && hostname != settings.remoteControllerHostname) {
    socketControlGroupClient.bind(0);
    setInterval(sendSubscribe, 5000)
}

setInterval(playbackCheck, 5000)
setInterval(heartbeatsCheck, 5000)


