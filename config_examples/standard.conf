//basic config

const os = require('os')

var settings = {}

settings.ntpServerHostname = 'Audioserv'

settings.controller = {
    remoteControllerHostname: 'Audioserv'  //if there is a server dedicated to multiroom sources put it's hostname here.
}

settings.sink = {
    controllerHostname: os.hostname(),  //used to find the controller on the network
    cardName: 'hw:0',
    alsaVolumeControlName: 'Digital',  //the name of the alsa volume control to adjust volume of your speakers.  look in alsamixer for the name. 
    alsaVolumeControlUnit: 'dB',      // hopefully your volume control supports decibels.  If not you'll get an error.  Set this to empty string and find the min and max values for your volume control and enter them below. User amixer -c "card number here" to find these values.   
    volumeOutMax: 0,  //This is the value sent to your volume control at max volume.  If your card supports db leave this alone.  
    volumeOutMin: -60,  //This is the value sent to your volume control at min volume.  If your card supports db leave this alone.
    //volumeScript: /home/michael/volume.js
}

settings.sources = [

    {
        audioSourceType: 'Spotify',
        setupPriority: 2,
        source_period_size: 2048,
        source_buffer_periods: 2,
        playback_period_size: 512,
        playback_buffer_periods: 4,
        additional_requested_latency: 0,
        audioSourceClients: [os.hostname()]
    },
    {
        audioSourceType: 'Airplay',
        setupPriority: 3,
        source_period_size: 2048,
        source_buffer_periods: 2,
        playback_period_size: 512,
        playback_buffer_periods: 4,
        additional_requested_latency: 0,
        audioSourceClients: [os.hostname()]
    }
]






spdifSourceExample = {
    audioSourceType: 'SPDIF',
    cardName: 'hw:0',
    setupPriority: 1,
    source_period_size: 512,
    source_buffer_periods: 4,
    playback_period_size: 512,
    playback_buffer_periods: 4,
    additional_requested_latency: 0,
    audioSourceClients: [os.hostname()]
}











module.exports = settings