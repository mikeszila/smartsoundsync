"use strict";

const os = require('os')

String.prototype.replaceAll = function (search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};

const fs = require('fs');
const { exec, spawn, execSync } = require('child_process');

//remove existing services

let stopOnly = false

process.argv.forEach(function (value, index) {
    console.log(value)

    if (value == '--stop') { stopOnly = true }

})



let installLocation = process.cwd()

let search = '/lib/systemd/system/'
let replacer = new RegExp(search, 'g')

let existingServices = String(execSync(`find /lib/systemd/system -name 'smartsoundsync*'`))
existingServices = existingServices.replace(replacer, '')
existingServices = existingServices.split(/\r?\n/)

existingServices.forEach(function (value, index) {
    if (value.length > 0) {
        console.log('stopping ', value)
        try { execSync(`systemctl stop ${value}`) }
        catch (error) { console.log('Error: could not stop', value, error) }
        console.log('disabling ', value)
        try { execSync(`systemctl disable ${value}`) }
        catch (error) { console.log('Error: could not disable', value, error) }
        console.log('removing service file ', value)
        try { execSync(`rm /lib/systemd/system/${value}`) }
        catch (error) { console.log('Error: could not remove', value, error) }
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
        try { execSync(`rm ${installLocation}/${value}`) }
        catch (error) { console.log('Error: could not remove', value, error) }
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
        try { execSync(`rm ${installLocation}/${value}`) }
        catch (error) { console.log('Error: could not remove', value, error) }
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
    try { execSync(`systemctl enable ${serviceName}`) }
    catch (error) { console.log('Error: could not enable', serviceName, error) }

    console.log(`starting ${serviceName}`)
    try { execSync(`systemctl start ${serviceName}`) }
    catch (error) { console.log('Error: could not start', serviceName, error) }
}

function execArgumentsParse(execArguments) {
    execArguments = JSON.stringify(execArguments)
    execArguments = execArguments.replace(/\\/g, "\\\\").replace(/\$/g, "\\$").replace(/'/g, "\\'").replace(/"/g, "\\\"");
    return execArguments
}


if (!stopOnly) {

    let dependencies = ['npm', 'ntp']

    dependencies.forEach(function (value, index) {
        let installed = execSync(`apt-cache policy ${value}`)
        if (installed.includes('Installed: (none)')) {
            console.log(`apt-get install ${value} -y`)
            execSync(`apt install ${value} -y`)
        }
    })

    let npmDependencies = ['pad']

    npmDependencies.forEach(function (value, index) {
        let installed = String(execSync(`npm list --depth=0 --loglevel=error`))
        console.log(installed)
        console.log(installed.length)
        if (!installed.includes(value)) {
            console.log(`npm install ${value} -y`)
            try { execSync(`npm install ${value} -y`) }
            catch (error) { console.log('Error: could not install', value, error) }
        }
    })


    let settings = require('./config.js')

    console.log('stopping ntp')
    execSync(`systemctl stop ntp`)
    let ntpConfigTemplate

    if (settings.ntpServerHostname && settings.ntpServerHostname != os.hostname()) {
        console.log('writing ntp client config')
        ntpConfigTemplate = fs.readFileSync('./ntp-client-template.conf', 'utf8')
        ntpConfigTemplate = ntpConfigTemplate.replaceAll('settings.ntpServerHostname', settings.ntpServerHostname)
    } else {
        console.log('writing ntp server config')
        ntpConfigTemplate = fs.readFileSync('./ntp-server-template.conf', 'utf8')
    }

    fs.writeFileSync(`/etc/ntp.conf`, ntpConfigTemplate, 'utf8')

    console.log('starting ntp')
    execSync(`systemctl start ntp`)

    let serviceName = ''
    let serviceTemplate = ''
    let servicesToStart = []
    let execArguments = ''
    let priority = 1

    console.log(settings)


    if (settings.controller) {
        execArguments = ''
        if (settings.controller.length) {
            execArguments = `"${execArgumentsParse(settings.controller)}"`
        }


        //control

        serviceTemplate = `[Unit]
Description=Audio local control
After=network-online.target sound.target
Requires=network-online.target
Wants=avahi-daemon.service

[Service]
Type=simple
ExecStart=/usr/bin/node ${installLocation}/control.js ${execArguments} 

Restart=always

[Install]
WantedBy=multi-user.target
`
        serviceName = `smartsoundsynccontrol.service`

        writeServiceFile(serviceName, serviceTemplate)
        servicesToStart.push(serviceName)

    }

    if (settings.source) {

        let settingsSourceCommon = JSON.parse(JSON.stringify(settings.source))
        delete settingsSourceCommon.sources

        if (!settings.source.sources) {
            settings.source.sources = [{ audioSourceClients: ['hostname'] }]
        }

        console.log('HELLO!!!', settings.source)

        settings.source.sources.forEach(function (value, index) {
            //librespot

            let sourceSettings = { ...settingsSourceCommon, ...value }


            if (!sourceSettings.audioSourceDisplayName && sourceSettings.audioSourceClients) {
                if (sourceSettings.audioSourceClients.length > 1) {
                    sourceSettings.audioSourceDisplayName = ''
                    sourceSettings.audioSourceClients.forEach(function (value2, index) {
                        sourceSettings.audioSourceDisplayName = sourceSettings.audioSourceDisplayName.concat(value2.slice(0, 3))
                    })
                } else {
                    sourceSettings.audioSourceDisplayName = sourceSettings.audioSourceClients[0]
                }
            }

            sourceSettings.setupPriority = priority
            priority = priority + 1

            serviceTemplate = `[Unit]
Description=${sourceSettings.audioSourceDisplayName} Pipe Librespot to UDP
After=network-online.target sound.target
Requires=network-online.target
Wants=avahi-daemon.service

[Service]
Type=simple
WorkingDirectory=${installLocation}
ExecStart=/usr/bin/node ${installLocation}/pipelibrespottoudp.js "${execArgumentsParse(sourceSettings)}" 

Restart=always

[Install]
WantedBy=multi-user.target
`
            serviceName = `smartsoundsyncspotify${sourceSettings.audioSourceDisplayName}.service`

            writeServiceFile(serviceName, serviceTemplate)
            servicesToStart.push(serviceName)




            //shairport
            sourceSettings.setupPriority = priority
            priority = priority + 1

            serviceTemplate = `[Unit]
Description=${sourceSettings.audioSourceDisplayName} Pipe shairport to UDP
After=network-online.target sound.target
Requires=network-online.target
Wants=avahi-daemon.service

[Service]
Type=simple
WorkingDirectory=${installLocation}
ExecStart=/usr/bin/node ${installLocation}/pipeshairporttoudp.js "${execArgumentsParse(sourceSettings)}"  

Restart=always

[Install]
WantedBy=multi-user.target
`
            serviceName = `smartsoundsyncairplay${sourceSettings.audioSourceDisplayName}.service`

            writeServiceFile(serviceName, serviceTemplate)
            servicesToStart.push(serviceName)
        })

    }

    execSync(`systemctl daemon-reload`)

    servicesToStart.forEach(function (value, index) {
        serviceStart(value)
    })
}