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

function execSyncPrint(command) {
    console.log(command)
    let returnData = execSync(command, { stdio: 'inherit' })
    //console.log(String(returnData))
    return returnData
}

let installLocation = process.cwd()

let installLocationUser = String(execSync('stat -c "%U" $PWD'))
installLocationUser = installLocationUser.replace(/(\r\n|\n|\r)/gm, "");

let configFileDir = '/usr/local/etc/smartsoundsync/'
let configFileName = 'config.js'
let configFilePath = configFileDir.concat(configFileName)
let binLocation = '/usr/local/bin/' 

let search = '/lib/systemd/system/'
let replacer = new RegExp(search, 'g')

let existingServices = String(execSync(`find /lib/systemd/system -name 'smartsoundsync*'`))
existingServices = existingServices.replace(replacer, '')
existingServices = existingServices.split(/\r?\n/)

existingServices.forEach(function (value, index) {
    if (value.length > 0) {
        try { execSyncPrint(`systemctl stop ${value}`) }
        catch (error) { console.log('Error: could not stop', value, error) }
        try { execSyncPrint(`systemctl disable ${value}`) }
        catch (error) { console.log('Error: could not disable', value, error) }
        try { execSyncPrint(`rm /lib/systemd/system/${value}`) }
        catch (error) { console.log('Error: could not remove', value, error) }
    }
})

function writeServiceFile(serviceName, serviceTemplate) {
    console.log(`writing service file ${serviceName}`)
    fs.writeFileSync(`${installLocation}/${serviceName}`, serviceTemplate, 'utf8')
    try { execSyncPrint(`mv ${installLocation}/${serviceName} /lib/systemd/system/${serviceName}`) }
    catch (error) {
        console.log(`Error: error moving service file to systemd. deleting template ${serviceName}`, error)
        execSyncPrint(`rm ${installLocation}/${serviceName}`)
    }
}

function serviceStart(serviceName) {
    try { execSyncPrint(`systemctl enable ${serviceName}`) }
    catch (error) { console.log('Error: could not enable', serviceName, error) }
    try { execSyncPrint(`systemctl start ${serviceName}`) }
    catch (error) { console.log('Error: could not start', serviceName, error) }
}

function execArgumentsParse(execArguments) {
    execArguments = JSON.stringify(execArguments)
    execArguments = execArguments.replace(/\\/g, "\\\\").replace(/\$/g, "\\$").replace(/'/g, "\\'").replace(/"/g, "\\\"");
    return execArguments
}

let hasSpotify = false
let hasAirplay = false
let hasSPDIF = false

if (!stopOnly) {
    if (fs.existsSync('/usr/local/etc/smartsoundsyncconf.js')) {  //move old style config to new style
        console.log('found old style config.  Converting to new style at', configFilePath)
        execSync(`mkdir -p /usr/local/etc/smartsoundsync/`)
        execSync(`mv /usr/local/etc/smartsoundsyncconf.js ${configFilePath}`)
    }

    if (fs.existsSync(configFilePath)) {
        console.log('config exists', configFilePath)
    } else {
        execSync(`mkdir -p ${configFileDir}`)
        execSync(`cp ${installLocation}/config_examples/standardconf.js ${configFilePath}`)
        execSyncPrint(`chown -R ${installLocationUser} ${configFileDir}`)
        console.log(`No config file found.  Created standard config file at ${configFilePath}.  Please ensure config is correct for your setup and re-run this script.`)
        process.exit()
    }

    let settings = require(configFilePath)

    let dependencies = ['npm', 'ntp',]

    let dependenciesSpotify = ['build-essential', 'cargo']

    let dependenciesshairport = ['build-essential', 'xmltoman', 'autoconf', 'automake', 'libtool', 'libdaemon-dev', 'libpopt-dev', 'avahi-daemon', 'libavahi-client-dev', 'libconfig-dev', 'libssl-dev']

    let dependenciessink = ['alsa-utils', 'alsa-tools', 'libasound2-plugins', 'ecasound', 'cmt', 'swh-plugins', 'ladspa-sdk', 'libasound2-dev', 'cmake']

    let dependenciesspdif = ['lirc', 'python3-pip', 'libxslt1-dev', 'libxml2-dev', 'zlib1g-dev', 'python3-lxml', 'python-lxml', 'libxml2-dev', 'libxslt-dev', 'python-dev', 'libasound2-dev']

    if (settings.sink) {
        dependencies = dependencies.concat(dependenciessink)
    }

    if (settings.sources) {
        settings.sources.forEach(function (value, index) {

            if (value.audioSourceType == 'Spotify') {
                hasSpotify = true
            }
            if (value.audioSourceType == 'Airplay') {
                hasAirplay = true
            }
            if (value.audioSourceType == 'SPDIF') {
                hasSPDIF = true
            }
        })
    }

    if (hasAirplay) {
        dependencies = dependencies.concat(dependenciesshairport)
    }

    if (hasSpotify) {
        dependencies = dependencies.concat(dependenciesSpotify)
    }

    if (hasSPDIF) {
        dependencies = dependencies.concat(dependenciesspdif)
    }

    dependencies.forEach(function (value, index) {
        let installed = execSync(`apt-cache policy ${value}`)
        if (installed.includes('Installed: (none)')) {
            execSyncPrint(`apt-get install ${value} -y`)
        }
    })

    let npmDependencies = ['pad']

    npmDependencies.forEach(function (value, index) {
        let installed = String(execSync(`npm list -g --depth=0 --loglevel=error`))
        if (!installed.includes(value)) {
            try { execSyncPrint(`npm install -g ${value} -y`) }
            catch (error) { console.log('Error: could not install', value, error) }
        }
    })

    execSyncPrint(`systemctl stop ntp`)
    let ntpConfigTemplate

    if (settings.ntpServerHostname && settings.ntpServerHostname != os.hostname()) {
        console.log('writing ntp client config')
        ntpConfigTemplate = fs.readFileSync('./templates/ntp-client-template.conf', 'utf8')
        ntpConfigTemplate = ntpConfigTemplate.replaceAll('settings.ntpServerHostname', settings.ntpServerHostname)
    } else {
        console.log('writing ntp server config')
        ntpConfigTemplate = fs.readFileSync('./templates/ntp-server-template.conf', 'utf8')
    }

    fs.writeFileSync(`/etc/ntp.conf`, ntpConfigTemplate, 'utf8')

    execSyncPrint(`systemctl start ntp`)

    if (settings.sink) {
        if (fs.existsSync(`${installLocation}/pcm`)) {
            console.log('pcm exists, skipping')
        } else {
            execSyncPrint(`gcc pcmblock.c -o /usr/local/bin/pcm -lasound`)
        }

        if (fs.existsSync(`/usr/local/lib/ladspa/RTlowshelf.so`)) {
            console.log('rtaylor filters exist, skipping')
        } else {
            execSyncPrint(`wget -q https://faculty.tru.ca/rtaylor/rt-plugins/rt-plugins-0.0.6.tar.gz -O /tmp/rt-plugins-0.0.6.tar.gz `)
            execSyncPrint(`cd /tmp/ && tar xfz rt-plugins-0.0.6.tar.gz`)
            execSyncPrint(`cd /tmp/rt-plugins-0.0.6/build && cmake ..`)
            execSyncPrint(`cd /tmp/rt-plugins-0.0.6/build && make `)
            execSyncPrint(`cd /tmp/rt-plugins-0.0.6/build && make install `)
        }
    }

    if (hasSpotify) {
        if (fs.existsSync(`${binLocation}/librespot`)) {
            console.log('librespot exists, skipping')
        } else {
            console.log('compiling librespot')
            try { execSync(`rm -r /tmp/librespot`) }
            catch (error) { }

            execSyncPrint(`cd /tmp/ && wget -q https://github.com/mikeszila/librespot/archive/dev.zip -O ./librespot.zip`)
            execSyncPrint(`cd /tmp/ && unzip -o librespot.zip -d librespot-new` )
            execSyncPrint(`cd /tmp/ && cp -v -a librespot-new/librespot-dev/. librespot`)

            execSyncPrint(`cd /tmp/ && rm librespot.zip`)
            execSyncPrint(`cd /tmp/ && rm -r librespot-new`)
            //execSyncPrint(`curl https://sh.rustup.rs -sSf | sh -s -- -y`)
            execSyncPrint(`cd /tmp/librespot && cargo build --no-default-features --release`)
            execSyncPrint(`cp /tmp/librespot/target/release/librespot ${binLocation}/librespot`)
        }
    }

    if (hasAirplay) {
        if (fs.existsSync(`/usr/local/bin/shairport-sync`)) {
            console.log('shairport exists, skipping')
        } else {
            console.log('compiling shairport')
            try { execSync(`rm -r /tmp/shairport-sync`) }
            catch (error) { }

            execSyncPrint(`cd /tmp/ && wget -q https://github.com/mikeszila/shairport-sync/archive/master.zip -O ./shairport-sync.zip`)
            execSyncPrint(`cd /tmp/ && unzip -o shairport-sync.zip -d shairport-sync-new`)
            execSyncPrint(`cd /tmp/ && cp -v -a shairport-sync-new/shairport-sync-master/. shairport-sync`)
            execSyncPrint(`cd /tmp/ && rm -r shairport-sync-new`)
            execSyncPrint(`cd /tmp/ && rm shairport-sync.zip`)
            execSyncPrint(`cd /tmp/shairport-sync && autoreconf -i -f`)
            execSyncPrint(`cd /tmp/shairport-sync && ./configure --with-avahi --with-ssl=openssl --with-pipe`)
            execSyncPrint(`cd /tmp/shairport-sync && make`)
            execSyncPrint(`cp /tmp/shairport-sync/shairport-sync ${binLocation}/shairport-sync`)
        }
    }

    if (hasSPDIF) {

        if (fs.existsSync(`${installLocation}/pcmrecord`)) {
            console.log('pcmrecord exists, skipping')
        } else {
            execSyncPrint(`gcc pcmrecord.c -o /usr/local/bin/pcmrecord -lasound`)
        }

        try {execSync('which dsptoolkit')}
        catch(error) {
            execSyncPrint(`wget https://raw.githubusercontent.com/hifiberry/hifiberry-dsp/master/install-dsptoolkit -O - | sh`)
        }
        
        let dspchecksum = String(execSync('dsptoolkit get-checksum'))
        if (dspchecksum.includes('7B03B17AD5B6B1A0E0DACB29BF31F024')) {
            console.log('correct dsp profile installed, skipping')
        } else {
            execSyncPrint('dsptoolkit install-profile https://raw.githubusercontent.com/hifiberry/hifiberry-os/master/buildroot/package/dspprofiles/dspdac-12.xml')
        }
    }

    let serviceName = ''
    let serviceTemplate = ''
    let servicesToStart = []
    let execArguments = ''
    let priority = 1





        execArguments = ''


        //control

        serviceTemplate = `[Unit]
Description=Audio local smartsoundsync
After=network-online.target sound.target
Requires=network-online.target
Wants=avahi-daemon.service

[Service]
Type=simple
WorkingDirectory=${installLocation}
ExecStart=/usr/bin/node ${installLocation}/smartsoundsync.js ${execArguments} 
TimeoutStopSec=5

Restart=always

[Install]
WantedBy=multi-user.target
`
        serviceName = `smartsoundsynccommon.service`

        writeServiceFile(serviceName, serviceTemplate)
        servicesToStart.push(serviceName)

    





    if (settings.controller) {
        if(settings.noSpeedup) {
            settings.controller.noSpeedup = true
        }

        execArguments = ''
        if (settings.controller.length) {
            console.log('control array no code for this yet')
        } else {
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
WorkingDirectory=${installLocation}
ExecStart=/usr/bin/node ${installLocation}/control.js ${execArguments} 
TimeoutStopSec=5

Restart=always

[Install]
WantedBy=multi-user.target
`
        serviceName = `smartsoundsynccontrol.service`

        writeServiceFile(serviceName, serviceTemplate)
        servicesToStart.push(serviceName)

    }

    if (settings.sink) {

        let ecasoundChainSetupFileDir = '/usr/local/etc/smartsoundsync/ecasound/'
        let ecasoundChainSetupFileName = 'chainsetup-file.ecs'
        let ecasoundChainSetupFilePath = ecasoundChainSetupFileDir.concat(ecasoundChainSetupFileName)
        let ecasoundFilterFileName = "Ecasound_Chain_Stereo_Flat.ecp"
        let ecasoundFilterFilePath = ecasoundChainSetupFileDir.concat(ecasoundFilterFileName)

        if (fs.existsSync(ecasoundChainSetupFilePath)) {
            console.log('config exists', ecasoundChainSetupFilePath)
        } else {
            execSync(`mkdir -p ${ecasoundChainSetupFileDir}`)
            
            execSync(`cp ${installLocation}/config_examples/chainsetup-file.ecs ${ecasoundChainSetupFilePath}`)
            execSync(`cp ${installLocation}/config_examples/Ecasound_Chain_Stereo_Flat.ecp ${ecasoundFilterFilePath}`)
            execSyncPrint(`chown -R ${installLocationUser} ${ecasoundChainSetupFileDir}`)
            console.log(`No config file found.  Created standard config file at ${ecasoundChainSetupFilePath}.  Please ensure config is correct for your setup and re-run this script.`)
            //process.exit()
        }






        execArguments = ''
        if (settings.sink.length) {
            console.log('sink array no code for this yet')
        } else {
            if(settings.noSpeedup) {
                settings.sink.noSpeedup = true
            }

            execArguments = `"${execArgumentsParse(settings.sink)}"`
        }


        //sink

        //        CPUSchedulingPolicy=rr
        //      CPUSchedulingPriority=90



        serviceTemplate = `[Unit]
Description=Audio sink
After=network-online.target sound.target
Requires=network-online.target
Wants=avahi-daemon.service

[Service]
Type=simple
WorkingDirectory=${installLocation}

ExecStart=/usr/bin/node ${installLocation}/udpplay.js ${execArguments}
TimeoutStopSec=5

Restart=always

[Install]
WantedBy=multi-user.target
`
        serviceName = `smartsoundsyncsink.service`

        writeServiceFile(serviceName, serviceTemplate)
        servicesToStart.push(serviceName)

    }

    if (settings.sources) {

        settings.sources.forEach(function (value, index) {
            //librespot

            let sourceSettings = value

            if(settings.noSpeedup) {
                settings.sources[index].noSpeedup = true
            }


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


            if (sourceSettings.audioSourceType == 'SPDIF') {

                serviceTemplate = `[Unit]
Description=${sourceSettings.audioSourceDisplayName} SPDIF to UDP
After=network-online.target sound.target
Requires=network-online.target
Wants=avahi-daemon.service

[Service]
Type=simple
WorkingDirectory=${installLocation}
ExecStart=/usr/bin/node ${installLocation}/spdiftoudp.js "${execArgumentsParse(sourceSettings)}" 
TimeoutStopSec=5

Restart=always

[Install]
WantedBy=multi-user.target
`
                serviceName = `smartsoundsyncspdif${sourceSettings.audioSourceDisplayName}.service`

                writeServiceFile(serviceName, serviceTemplate)
                servicesToStart.push(serviceName)

            }



            if (sourceSettings.audioSourceType == 'Spotify') {

                serviceTemplate = `[Unit]
Description=${sourceSettings.audioSourceDisplayName} Pipe Librespot to UDP
After=network-online.target sound.target
Requires=network-online.target
Wants=avahi-daemon.service

[Service]
Type=simple
WorkingDirectory=${installLocation}
ExecStart=/usr/bin/node ${installLocation}/pipelibrespottoudp.js "${execArgumentsParse(sourceSettings)}" 
TimeoutStopSec=5

Restart=always

[Install]
WantedBy=multi-user.target
`
                serviceName = `smartsoundsyncspotify${sourceSettings.audioSourceDisplayName}.service`

                writeServiceFile(serviceName, serviceTemplate)
                servicesToStart.push(serviceName)

            }


            if (sourceSettings.audioSourceType == 'Airplay') {

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
TimeoutStopSec=5

Restart=always

[Install]
WantedBy=multi-user.target
`
                serviceName = `smartsoundsyncairplay${sourceSettings.audioSourceDisplayName}.service`

                writeServiceFile(serviceName, serviceTemplate)
                servicesToStart.push(serviceName)

            }
        })
    }

    execSyncPrint(`systemctl daemon-reload`)

    servicesToStart.forEach(function (value, index) {
        serviceStart(value)
    })
}