//This is an example configuration only.  The actual configuration file resides at /usr/local/etc/smartsoundsyncconf.js
//Spotify, Airplay, and Sink

//Active 3 way using a 7.1 HDMI receiver.  My receiver is a Dennon AVR-2112CI, though it shouldnt matter for the settings here.  The volumeControlScript is specific to this receiver though.  
//I used this reference for the active 3 way part of this:  https://rtaylor.sites.tru.ca/2013/06/25/digital-crossovereq-with-open-source-software-howto/
//If I make the buffer of ecasound large the phase of drivers get's all out of whack, so something is wrong.  Buffer is currently 256 samples.  

//This will not work on a Raspberry PI unless you recompile the kernel to change the max channels setting from 2 to 8.  I had a spare laptop laying around so I installed Ubuntu server on it and used that.
//I did have this working on an RPI previously, forgot about the kernel, ran an update, and broke everything.  I got it running again but the channel mapping was randomly different each time I played audio.  Haven't had that problem with Ubuntu server on a laptop.


const os = require('os')

var settings = {}

settings.ntpServerHostname = 'Audioserv'

settings.controller = {
    remoteControllerHostname: 'Audioserv'  //if there is a server dedicated to multiroom sources put it's hostname here.
}

settings.sink = {
    controllerHostname: os.hostname(),  //used to find the controller on the network
    cardName: 'hw:0,3', // the name of your soundcard.  Use aplay -l to find.  smartsoundsync must have direct access to the hardware of the card for syncronization to function correctly.  plughw or any ALSA specification other than hw:? will not work.  
    alsaVolumeControlName: 'Digital',  //the name of the alsa volume control that adjusts the volume of your speakers.  look in alsamixer or run amixer to find the name.     
    soundCardSupportsDecibels: true,  //  If your soundcard supports decibels set to true, if not false. 
    //volumeOutMin: -60,  //The value to send the mixer for minimum volume.  Not necessary if your card supports decibels.  Use 'amixer' then look for something like 'Limits: 0 - 255' to find the minimum value your mixer is expecting.
    //volumeOutMax: 0  //The value to send the mixer for minimum volume.  Not necessary if your card supports decibels.  Use 'amixer' then look for something like 'Limits: 0 - 255' to find the minimum value your mixer is expecting.
    ecasound: `export LADSPA_PATH=/usr/local/lib/ladspa:/usr/lib/ladspa; stdbuf -i0 -o0 -e0  ecasound -B:rt -ddd -z:mixmode,sum -z:nodb -b:ecasound_buffer_size  -a:pre, woofer -f:16,2,44100 -i stdin -a:pre -o:loop,1 \ -a:mid,tweeter -i:loop,1 \ -a:pre -pf:pre-3way.ecp \ -a:woofer -pf:woofer.ecp -chorder:1,2,0,0,0,0,0,0 \ -a:mid -pf:mid.ecp -chorder:0,0,1,2,0,0,0,0 \ -a:tweeter -pf:tweeter.ecp -chorder:0,0,0,0,0,0,1,2 \ -a:woofer,mid,tweeter -f:s16,8,44100 -o:stdout`,
    outputChannels: 8,
    volumeControlScript: "/usr/local/lib/smartsoundsync/config_examples/volumeStub.js"  //a volume control stub for you to put code to write the volume to your receiver.  Do not modify the file here because it'll get overwritten on the next program update.  
    //volumeControlScript: "/home/michael/Dennonvolume.js"  This is where I keep my volume control script.  If you have a Dennon or Marantz receiver this script might work for you.  It's in the examples folder.  
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
        //audioSourceDisplayName: 'Fred'  //Is automatically set to audioSourceClients if one client/sink or the first three letters of each client/sink if multiple, or you can specify a name.  
    }
]

module.exports = settings