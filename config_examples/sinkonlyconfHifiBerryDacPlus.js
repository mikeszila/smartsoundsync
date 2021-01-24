//This is an example configuration only.  The actual configuration file resides at /usr/local/etc/smartsoundsyncconf.js
// Sink only  Possible uses are a second set of speakers for a large room, or you want left and right speakers fully wireless, etc.   

const os = require('os')

var settings = {}

settings.ntpServerHostname = 'Audioserv'



settings.sink = {
    controllerHostname: 'HostnameOfControllertoConnectTo',  //used to find the controller on the network
    cardName: 'hw:0', // the name of your soundcard.  Use aplay -l to find.  smartsoundsync must have direct access to the hardware of the card for syncronization to function correctly.  plughw or any ALSA specification other than hw:? will not work.  
    alsaVolumeControlName: 'Digital',  //the name of the alsa volume control that adjusts the volume of your speakers.  look in alsamixer or run amixer to find the name.     
    soundCardSupportsDecibels: true,  //  If your soundcard supports decibels set to true, if not false. 
    //volumeOutMin: -60,  //The value to send the mixer for minimum volume.  Not necessary if your card supports decibels.  Use 'amixer' then look for something like 'Limits: 0 - 255' to find the minimum value your mixer is expecting.
    //volumeOutMax: 0  //The value to send the mixer for minimum volume.  Not necessary if your card supports decibels.  Use 'amixer' then look for something like 'Limits: 0 - 255' to find the minimum value your mixer is expecting.
}

if (settings.soundCardSupportsDecibels) {
    settings.alsaVolumeControlUnit = 'dB'
    settings.volumeOutMin = -60
    settings.volumeOutMax = 0
}

module.exports = settings