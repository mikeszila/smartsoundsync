//This is an example configuration only.  The actual configuration file resides at /usr/local/etc/smartsoundsyncconf.js

//Multiroom server.  Ideally this system should be hardwired into your network to prevent multiroom packets from having to traverse your wireless network twice.  

const os = require('os')

var settings = {}

settings.ntpServerHostname = os.hostname()  // the NTP server name.  Should be the same as the multiroom server unless there's good reason not to.

settings.controller = {
    remoteControllerHostname: os.hostname()  //if there is a server dedicated to multiroom sources put it's hostname here.  This config is for the server, so put it's hostname here. 
}

let commonSourceSettings = {  //common settings for Spotify and Airplay
    source_period_size: 10240,
    source_buffer_periods: 2,
    playback_period_size: 512,
    playback_buffer_periods: 4,
    additional_requested_latency: 0
}


//This list of sources will be setup for Spotify and Airplay.  
//The names are the hostnames of your smartsoundsync clients with playback capability.  
//The names shown are examples from my personal setup, replace them with your names.  
settings.sources = [  
    { audioSourceClients: ['Kitchen', 'Sunroom'] },
    { audioSourceClients: ['Kitchen', 'Livingroom'] },
//  { audioSourceClients: ['Kitchen', 'Familyroom'] },
    { audioSourceClients: ['Familyroom', 'Livingroom'] },
    { audioSourceClients: ['Bedroom', 'Kitchen'] },
    { audioSourceClients: ['Bedroom', 'Sebastian'] },
    { audioSourceClients: ['Familyroom', 'Laundry'], audioSourceDisplayName: 'Downstairs' },
    { audioSourceClients: ['Bedroom', 'Kitchen', 'Sebastian'] },
    { audioSourceClients: ['Kitchen', 'Livingroom', 'Sunroom'] },
    { audioSourceClients: ['Bedroom', 'Kitchen', 'Livingroom'] },
    { audioSourceClients: ['Bedroom', 'Kitchen', 'Livingroom', 'Sebastian'] },
//  { audioSourceClients: ['Kitchen', 'Familyroom', 'Livingroom'] },
//  { audioSourceClients: ['Kitchen', 'Familyroom', 'Livingroom', 'Sunroom'] },
    { audioSourceClients: ['Bedroom', 'Kitchen', 'Livingroom', 'Sebastian', 'Sunroom'], audioSourceDisplayName: 'Upstairs' },
//  { audioSourceClients: ['Bedroom', 'Kitchen', 'Familyroom', 'Livingroom'] },
//  { audioSourceClients: ['Kitchen', 'Familyroom', 'Laundry', 'Livingroom', 'Sunroom'] },
    { audioSourceClients: ['All'] },  //  All clients which have their "remoteControllerHostname" set to the hostname of this server will play when this source is selcted.
]


let priority = 100  //starting priority for multiroom sources

let addTypes = []  //logic to build the actual settings from what's above.  Nothing needed from this point down.  
settings.sources.forEach(function(value, index) {
    addTypes.push({...{audioSourceType: 'Spotify', setupPriority: priority = priority + 1}, ...value})
    addTypes.push({...{audioSourceType: 'Airplay', setupPriority: priority = priority + 1}, ...value})
})
settings.sources = addTypes

let addCommon = []
settings.sources.forEach(function(value, index) {
    addCommon.push({...commonSourceSettings, ...value})
})
settings.sources = addCommon

module.exports = settings