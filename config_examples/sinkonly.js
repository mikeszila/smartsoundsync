//This is an example configuration only.  The actual configuration file resides at /usr/local/etc/smartsoundsyncconf.js
// Sink only  Possible uses are a second set of speakers for a large room, or you want left and right speakers fully wireless, etc.   

const os = require('os')

var settings = {}

settings.ntpServerHostname = 'Audioserv'

settings.sink = {
    controllerHostname: 'HostnameOfControllertoConnectTo',  //change this to the hostname of the computer you want to connect to.  This computer will then play the audio determined by the controller on the computer specified.  
    hostnameForMatch: 'nameForMatch', //the name used for matching a source.  Usefull if you want to match with sources which do not match the name of the controller you're connecting to. 
    cardName: 'hw:0', // the name of your soundcard.  Use aplay -l to find.  smartsoundsync must have direct access to the hardware of the card for syncronization to function correctly.  plughw or any ALSA specification other than hw:? will not work.  
    alsaVolumeControlName: 'Master',  //the name of the alsa volume control that adjusts the volume of your speakers.  look in alsamixer or run amixer to find the name.     
    soundCardSupportsDecibels: true,  //  If your soundcard supports decibels set to true, if not false. 
    //volumeOutMin: 0,  //The value to send the mixer for minimum volume.  Not necessary if your card supports decibels.  Use 'amixer' then look for something like 'Limits: 0 - 255' to find the minimum value your mixer is expecting.
    //volumeOutMax: 255  //The value to send the mixer for minimum volume.  Not necessary if your card supports decibels.  Use 'amixer' then look for something like 'Limits: 0 - 255' to find the minimum value your mixer is expecting.
}

module.exports = settings