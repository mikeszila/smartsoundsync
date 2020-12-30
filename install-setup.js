"use strict";

const fs = require('fs');
const { exec, spawn, execSync } = require('child_process');

//remove existing services

let installLocation = process.cwd()

let search = '/lib/systemd/system/'
let replacer = new RegExp(search, 'g')

let existingServices = String(execSync(`find /lib/systemd/system -name 'smartsoundsync*'`))
existingServices = existingServices.replace(replacer, '')
existingServices = existingServices.split(/\r?\n/)

existingServices.forEach(function (value, index) {
    if (value.length > 0) {
        console.log('stopping ', value)
        try {execSync(`systemctl stop ${value}`)}
        catch (error) {console.log('Error: could not stop', value, error) }
        console.log('disabling ', value)
        try {execSync(`systemctl disable ${value}`)}
        catch (error) {console.log('Error: could not disable', value, error) }
        console.log('removing service file ', value)
        try {execSync(`rm /lib/systemd/system/${value}`)}
        catch (error) {console.log('Error: could not remove', value, error) }
        console.log('removed', value)
    }
})

search = `${installLocation}/` 
replacer = new RegExp(search, 'g')

let existingAudioFifos = String(execSync(`find ${installLocation} -name 'audiofifo*'`))
existingAudioFifos = existingAudioFifos.replace(replacer, '')
existingAudioFifos = existingAudioFifos.split(/\r?\n/)

existingAudioFifos.forEach(function (value, index) {
    if (value.length > 0) {
        console.log('removing ', value)
        try {execSync(`rm ${installLocation}/${value}`)}
        catch (error) {console.log('Error: could not remove', value, error) }
        console.log('removed', value)
    }
})

search = `${installLocation}/` 
replacer = new RegExp(search, 'g')

let existingShairportConfs = String(execSync(`find ${installLocation} -name 'shairport-sync-*.conf'`))
existingShairportConfs = existingShairportConfs.replace(replacer, '')
existingShairportConfs = existingShairportConfs.split(/\r?\n/)

existingShairportConfs.forEach(function (value, index) {

    if (value.length > 0 && !value.includes('shairport-sync/scripts') && !value.includes('template')) {
        console.log(value)
        console.log('removing ', value)
        try {execSync(`rm ${installLocation}/${value}`)}
        catch (error) {console.log('Error: could not remove', value, error) }
        console.log('removed', value)
    }

})

function writeServiceFile(serviceName, serviceTemplate) {
    console.log(`writing service file ${serviceName}`)
    fs.writeFileSync(`${installLocation}/${serviceName}`, serviceTemplate, 'utf8')
    console.log(`moving service file to systemd ${serviceName}`)
    try { execSync(`mv ${installLocation}/${serviceName} /lib/systemd/system/${serviceName}`) }
    catch (error) {
        console.log(`Error: error moving service file to systemd. deleting template ${serviceName}`, error)
        execSync(`rm ${installLocation}/${serviceName}`)
    }
}

function serviceStart(serviceName) {
    console.log(`enabling ${serviceName}`)
    try {execSync(`systemctl enable ${serviceName}`)}
    catch (error) {console.log('Error: could not enable', serviceName, error) }

    console.log(`starting ${serviceName}`)
    try {execSync(`systemctl start ${serviceName}`)}
    catch (error) {console.log('Error: could not start', serviceName, error) }    
}

let serviceName = ''
let serviceTemplate = ''
let servicesToStart = []
let execArguments = ''
let priority = 1

//control

serviceTemplate = `[Unit]
Description=Audio local control
After=network-online.target sound.target
Requires=network-online.target
Wants=avahi-daemon.service

[Service]
Type=simple
ExecStart=/usr/bin/node ${installLocation}/control.js

Restart=always

[Install]
WantedBy=multi-user.target
`
serviceName = `smartsoundsynccontrol.service`

writeServiceFile(serviceName, serviceTemplate)
servicesToStart.push(serviceName)

let test = [
    { audioSourceClients: ['Kitchen', 'Sunroom'] },
    { audioSourceClients: ['Kitchen', 'Livingroom'] },
    { audioSourceClients: ['Kitchen', 'Familyroom'] },
    { audioSourceClients: ['Familyroom', 'Livingroom'] },
    { audioSourceClients: ['Bedroom', 'Kitchen'] },
    { audioSourceClients: ['Familyroom', 'Laundry'] },
    { audioSourceClients: ['Kitchen', 'Livingroom', 'Sunroom']},
    { audioSourceClients: ['Bedroom', 'Kitchen', 'Livingroom']},
    { audioSourceClients: ['Kitchen', 'Familyroom', 'Livingroom']},
    { audioSourceClients: ['Kitchen', 'Familyroom', 'Livingroom', 'Sunroom']},
    { audioSourceClients: ['Bedroom', 'Kitchen', 'Familyroom', 'Livingroom']},
    { audioSourceClients: ['Kitchen', 'Familyroom', 'Laundry', 'Livingroom', 'Sunroom']},
    
    { audioSourceClients: ['All'] },
]


//"{\"setupPriority\": 21, \"audioSourcePort\": 40021, \"audioSourceDisplayName\": \"KitSun\", \"audioSourceClients\":[\"Kitchen\", \"Sunroom\"]}"
//"{\"outputChannels\": 8, \"useEcasound\": true, \"cardName\": \"hw:0,3\"}"


test.forEach(function (value, index) {
    //librespot


    if (!value.audioSourceDisplayName && value.audioSourceClients) {
        if (value.audioSourceClients.length > 1) {
            value.audioSourceDisplayName = ''
            value.audioSourceClients.forEach(function (value2, index) {
                value.audioSourceDisplayName = value.audioSourceDisplayName.concat(value2.slice(0,3))        
            })
        } else {
            value.audioSourceDisplayName = value.audioSourceClients[0]
        }       
    }

    value.setupPriority = priority
    priority = priority + 1
    execArguments = JSON.stringify(value)
    execArguments = execArguments.replace(/\\/g, "\\\\").replace(/\$/g, "\\$").replace(/'/g, "\\'").replace(/"/g, "\\\"");

    serviceTemplate = `[Unit]
Description=${value.audioSourceDisplayName} Pipe Librespot to UDP
After=network-online.target sound.target
Requires=network-online.target
Wants=avahi-daemon.service

[Service]
Type=simple
WorkingDirectory=${installLocation}
ExecStart=/usr/bin/node ${installLocation}/pipelibrespottoudp.js "${execArguments}" 

Restart=always

[Install]
WantedBy=multi-user.target
`
    serviceName = `smartsoundsyncspotify${value.audioSourceDisplayName}.service`

    writeServiceFile(serviceName, serviceTemplate)
    servicesToStart.push(serviceName)




    //shairport
    value.setupPriority = priority
    priority = priority + 1
    execArguments = JSON.stringify(value)
    execArguments = execArguments.replace(/\\/g, "\\\\").replace(/\$/g, "\\$").replace(/'/g, "\\'").replace(/"/g, "\\\"");
    serviceTemplate = `[Unit]
Description=${value.audioSourceDisplayName} Pipe shairport to UDP
After=network-online.target sound.target
Requires=network-online.target
Wants=avahi-daemon.service

[Service]
Type=simple
WorkingDirectory=${installLocation}
ExecStart=/usr/bin/node ${installLocation}/pipeshairporttoudp.js "${execArguments}" 

Restart=always

[Install]
WantedBy=multi-user.target
`
    serviceName = `smartsoundsyncairplay${value.audioSourceDisplayName}.service`

    writeServiceFile(serviceName, serviceTemplate)
    servicesToStart.push(serviceName)
})

execSync(`systemctl daemon-reload`)

servicesToStart.forEach(function (value, index) {
    serviceStart(value)
})