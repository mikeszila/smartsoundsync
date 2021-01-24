//This is an example configuration only.  The actual configuration file resides at /usr/local/etc/smartsoundsyncconf.js
//SPDIF,Spotify, Airplay, and Sink using Hifiberry Dac plus DSP soundcard.  

const os = require('os')

var settings = {}

settings.ntpServerHostname = 'Audioserv'

settings.controller = {
    remoteControllerHostname: 'Audioserv'  //if there is a server dedicated to multiroom sources put it's hostname here.
}

settings.sink = {
    controllerHostname: os.hostname(),  //used to find the controller on the network
    cardName: 'hw:0', // the name of your soundcard.  Use aplay -l to find.  smartsoundsync must have direct access to the hardware of the card for syncronization to function correctly.  plughw or any ALSA specification other than hw:? will not work.  
    alsaVolumeControlName: 'DSPVolume',  //the name of the alsa volume control that adjusts the volume of your speakers.  look in alsamixer or run amixer to find the name.     
    soundCardSupportsDecibels: false,  //  If your soundcard supports decibels set to true, if not false. 
    volumeOutMin: 0,  //The value to send the mixer for minimum volume.  Not necessary if your card supports decibels.  Use 'amixer' then look for something like 'Limits: 0 - 255' to find the minimum value your mixer is expecting.
    volumeOutMax: 255  //The value to send the mixer for minimum volume.  Not necessary if your card supports decibels.  Use 'amixer' then look for something like 'Limits: 0 - 255' to find the minimum value your mixer is expecting.
}

if (settings.soundCardSupportsDecibels) {
    settings.alsaVolumeControlUnit = 'dB'
    settings.volumeOutMin = -60
    settings.volumeOutMax = 0
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
        audioSourceClients: [os.hostname()],
        //audioSourceDisplayName: 'Bob'  //Is automatically set to audioSourceClients if one client/sink or the first three letters of each client/sink if multiple, or you can specify a name. 
    },
    {
        audioSourceType: 'Airplay',
        setupPriority: 3,
        source_period_size: 2048,
        source_buffer_periods: 2,
        playback_period_size: 512,
        playback_buffer_periods: 4,
        additional_requested_latency: 0,
        audioSourceClients: [os.hostname()],
        //audioSourceDisplayName: 'Bob'  //Is automatically set to audioSourceClients if one client/sink or the first three letters of each client/sink if multiple, or you can specify a name. 
    },
    {
        audioSourceType: 'SPDIF',
        cardName: 'hw:0',
        setupPriority: 1,
        source_period_size: 512,
        source_buffer_periods: 4,
        playback_period_size: 512,
        playback_buffer_periods: 4,
        additional_requested_latency: 0,
        audioSourceClients: [os.hostname()],
        //audioSourceDisplayName: 'Bob'  //Is automatically set to audioSourceClients if one client/sink or the first three letters of each client/sink if multiple, or you can specify a name. 
    }
]

module.exports = settings