//This is an example configuration only.  The actual configuration file resides at /usr/local/etc/smartsoundsyncconf.js
//SPDIF,Spotify, Airplay, and Sink using Hifiberry Dac plus DSP soundcard available here: https://www.hifiberry.com/blog/announcing-the-dac-dsp/

//Make these changes in /boot/config.txt

//For the soundcard
    //Change dtparam=audio=on to #dtparam=audio=on to disable onboard audio
    //add dtoverlay=hifiberry-dacplusdsp to add the HIFIberry overlay for the Hifiberry Dacplusdsp card
    //change #dtparam=spi=on to dtparam=spi=on to enable SPI communication as required by the Hifiberry Dacplusdsp card

//For the infrared remote    
    //dtoverlay=gpio-ir,gpio_pin=5  The standard gpio pin for infrared is used by the Dacplusdsp card, so I used pin 5.
    // in the config file /etc/lirc/lirc_options.conf make the below changes
    // driver = default
    // device = /dev/lirc0
    // find the configuration file for your remote here: http://lirc.sourceforge.net/remotes/ and put it here: /etc/lirc/lircd.conf.d
    // run sudo systemctl restart lirc
    // run irw and press some buttons.  If you see some output it worked.  
    // run sudo systemctl restart smartsoundsyncspdifSOURCENAMEHERE  (replace SOURCENAMEHERE with the name of your source, probably the computer's hostname)
    // Try some buttons to see if it worked.  
    // The remote database files are all supposed to be standardized.  The vizio, samsung, and onkyo remote files all report KEY_VOLUMEUP for volume up for example, so that's hardcoded into to smartsoundsync.
    // If you generate your own remote file, please try to use these standard button names.  If you come across a standard remote file that uses different names, please let me know and I'll come up with a solution.  

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
        source_rate: 48000,
        source_period_size: 512,
        source_buffer_periods: 4,
        playback_period_size: 512,
        playback_buffer_periods: 4,
        additional_requested_latency: 10,
        audioSourceClients: [os.hostname()],
        hasHifiberryDacDSP: true,
        //audioSourceDisplayName: 'Bob'  //Is automatically set to audioSourceClients if one client/sink or the first three letters of each client/sink if multiple, or you can specify a name. 
    }
]

module.exports = settings