const { exec, spawn, execSync } = require('child_process');
common = require('./common.js')

var localSettings = {
    source_period_size: 2048 * 6,
    source_buffer_periods: 2,
    playback_period_size: 512,
    playback_buffer_periods: 4,
    setupPriority: 3,
    audioSourceType: 'Airplay',
    volume_shairport_min: -30,
    volume_shairport_max: 0
}

settings = { ...settings, ...localSettings }

cmdlineSTR = String(process.argv)
cmdSettingsJSON = cmdlineSTR.slice(cmdlineSTR.lastIndexOf('{'), cmdlineSTR.lastIndexOf('}') + 1)

if (cmdSettingsJSON != 0) {
    cmdSettingsObj = JSON.parse(String(cmdSettingsJSON))
    console.log(cmdSettingsObj)
    settings = { ...settings, ...cmdSettingsObj }
}

global.buffertoudp = require('./buffertoudp.js')

global.reported_exact_rate = settings.source_rate
global.reported_buffer_size = settings.source_buffer_periods * settings.source_period_size
global.reported_period_size = settings.source_period_size
global.reported_channels = settings.source_channels
global.reported_period_time = (1 / settings.source_rate) * 1000 * settings.source_period_size
global.source_buffer_time = settings.source_buffer_periods * reported_period_time
global.playback_period_time = (1 / settings.source_rate) * 1000 * settings.playback_period_size
global.playback_buffer_size = settings.playback_period_size * settings.playback_buffer_periods
global.playback_buffer_time = playback_period_time * settings.playback_buffer_periods

if (source_buffer_time > playback_buffer_time) {
    global.desired_playback_delay = source_buffer_time + 50
    console.log('source buffer time', desired_playback_delay)
} else {
    global.desired_playback_delay = playback_buffer_time + 50
    console.log('playback buffer time', desired_playback_delay)
}

function generateRandomPort() {
    return Math.floor((Math.random() * 28231) + 32768)
}

let audiofifopath = `/tmp/audiofifo_shairport_${settings.audioSourceDisplayName}`
let configpath = `/tmp/shairport-sync-${settings.audioSourceDisplayName}.conf`

if (fs.existsSync(audiofifopath)) {
    console.log('audiofifo exists', audiofifopath)
} else {
    console.log('audiofifo does not exist', audiofifopath)
    execSync(`mkfifo ${audiofifopath}`)
}

function spawnshairport() {

    fs.readFile('./templates/shairport-sync-template.conf', 'utf8', function (err, data) {
        if (err) {
            return console.log(err);
        }

        String.prototype.replaceAll = function (search, replacement) {
            var target = this;
            return target.split(search).join(replacement);
        };

        var result = data.replaceAll('player_name', settings.audioSourceDisplayName);
        result = result.replaceAll('pathtopipe', audiofifopath);
        result = result.replaceAll('airplayPort', generateRandomPort());

        fs.writeFile(configpath, result, 'utf8', function (err) {
            if (err) return console.log(err);

            shairport = spawn(`/usr/local/bin/shairport-sync`, ['-a', settings.audioSourceDisplayName, '-u', '-c', `${configpath}`]);
            shairport.stdout.on('data', (data) => {
                console.log('shairport', String(data))
            });
            shairport.stderr.on('data', (data) => {
                console.log('shairport', String(data))
                message = String(data)



                if (
                    message.includes('bufferDuration/2:') || message.includes('start.sh')
                ) {
                    captureState = 'active'
                    common.setPriority(process.pid, 80)
                    common.setPriority(shairport.pid, 80)

                    buffertoudp.sendStatusUpdatetoSink()
                    buffertoudp.sendStatusUpdatetoControl()
                }

                if (
                    message.includes('stop.sh')
                ) {
                    captureState = 'idle'
                    common.setPriority(process.pid, -19)
                    common.setPriority(shairport.pid, -19)
                    buffertoudp.sendStatusUpdatetoSink()
                    buffertoudp.sendStatusUpdatetoControl()
                }



                if (message.includes('Airplay Volume:')) {
                    let shairport_volume = message.slice(message.lastIndexOf('Airplay Volume:') + 15, message.lastIndexOf('\n'))
                    if (shairport_volume == -144) {
                        shairport_volume = -30
                    }
                    let shairport_db_volume = (settings.volume_db_min - settings.volume_db_max) / (settings.volume_shairport_min - settings.volume_shairport_max) * (shairport_volume - settings.volume_shairport_min) + settings.volume_db_min
                    console.log('shairport Volume ///////////////////////////', shairport_volume, shairport_db_volume)

                    volumeOut = shairport_db_volume
                    buffertoudp.sendStatusUpdatetoSink()
                }


            });
            shairport.on('close', (code) => {
                console.log('shairport', 'close', String(code))
                process.exit()
                //setTimeout(spawnshairport, 2000)
            });
            
        });
    });
}


var readStream = fs.createReadStream(audiofifopath);
var sendTime = 0
var lastData = 0
var sampleIndex = 0
var bufferTime = settings.setup_buffer_periods * reported_period_time

function readFunc() {
    if (sendTime < (Date.now()) || sendTime == 0) {
        audioData = readStream.read(reported_period_size * 4)
        if (audioData != null) {
            if (sendTime == 0 || sendTime < (Date.now() - source_buffer_time * 2)) {
                console.log('SEND TIME RESET!!!!!')
                sendTime = Date.now() // reset sendTime if it get's too far behind, typically due to pause or first scan.  
            }
            buffertoudp.sendAudioUDP(audioData, sendTime + reported_period_time, sampleIndex)
            sendTime = sendTime + (reported_period_time * ntpCorrection)
            sampleIndex = sampleIndex + 1
            lastData = Date.now()
            if (captureState != 'active') {
                captureState = 'active'
                console.log('capture state', captureState, '///////////////////////////')
                // buffertoudp.sendStatusUpdatetoSink()
                buffertoudp.sendStatusUpdatetoControl()
            }
        } else {
            if (captureState != 'idle' && lastData < (Date.now() - 15000)) {
                captureState = 'idle'
                console.log('capture state', captureState, '/////////////////////////// BECAUSE NO DATA')
                buffertoudp.sendStatusUpdatetoControl()

            }
        }
    }
}

spawnshairport()
setInterval(readFunc, 8)



