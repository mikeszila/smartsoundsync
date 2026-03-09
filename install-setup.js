"use strict";

const os = require("os");
const fs = require("fs");
const { execSync } = require("child_process");

String.prototype.replaceAll = function (search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};

// remove existing services
let stopOnly = false;

process.argv.forEach(function (value, index) {
    console.log(value);
    if (value === "--stop") {
        stopOnly = true;
    }
});

function execSyncPrint(command) {
    console.log(command);
    let returnData = execSync(command, { stdio: "inherit" });
    return returnData;
}

let installLocation = process.cwd();

console.log("install location:", installLocation);

let installLocationUser = String(execSync('stat -c "%U" $PWD'));
installLocationUser = installLocationUser.replace(/(\r\n|\n|\r)/gm, "");

execSyncPrint(`chown -R ${installLocationUser} ${installLocation}`);

let configFileDir = "/usr/local/etc/smartsoundsync/";
let configFileName = "config.js";
let configFilePath = configFileDir.concat(configFileName);
let binLocation = "/usr/local/bin/";

let search = "/lib/systemd/system/";
let replacer = new RegExp(search, "g");

let existingServices = String(execSync(`find /lib/systemd/system -name 'smartsoundsync*'`));
existingServices = existingServices.replace(replacer, "");
existingServices = existingServices.split(/\r?\n/);

existingServices.forEach(function (value, index) {
    if (value.length > 0) {
        try { execSyncPrint(`systemctl stop ${value}`); }
        catch (error) { console.log("Error: could not stop", value, error); }
        try { execSyncPrint(`systemctl disable ${value}`); }
        catch (error) { console.log("Error: could not disable", value, error); }
        try { execSyncPrint(`rm /lib/systemd/system/${value}`); }
        catch (error) { console.log("Error: could not remove", value, error); }
    }
});

function writeServiceFile(serviceName, serviceTemplate) {
    console.log(`writing service file ${serviceName}`);
    fs.writeFileSync(`${installLocation}/${serviceName}`, serviceTemplate, "utf8");
    try { execSyncPrint(`mv ${installLocation}/${serviceName} /lib/systemd/system/${serviceName}`); }
    catch (error) {
        console.log(`Error: error moving service file to systemd. deleting template ${serviceName}`, error);
        execSyncPrint(`rm ${installLocation}/${serviceName}`);
    }
}

function serviceStart(serviceName) {
    try { execSyncPrint(`systemctl enable ${serviceName}`); }
    catch (error) { console.log("Error: could not enable", serviceName, error); }
    try { execSyncPrint(`systemctl start ${serviceName}`); }
    catch (error) { console.log("Error: could not start", serviceName, error); }
}

function execArgumentsParse(execArguments) {
    execArguments = JSON.stringify(execArguments);
    execArguments = execArguments.replace(/\\/g, "\\\\").replace(/\$/g, "\\$").replace(/'/g, "\\'").replace(/"/g, '\\"');
    execArguments = execArguments.replaceAll(os.hostname(), "%H");
    return execArguments;
}

let hasSpotify = false;
let hasAirplay = false;
let hasSPDIF = false;
let hasHifiberryDacDSP = false;

let ecasoundChainSetupFileDir = "/usr/local/etc/smartsoundsync/ecasound/";
let ecasoundChainSetupFileName = "chainsetup-file.ecs";
let ecasoundChainSetupFilePath = ecasoundChainSetupFileDir.concat(ecasoundChainSetupFileName);
let ecasoundFilterFileName = "default.ecp";
let ecasoundFilterFilePath = ecasoundChainSetupFileDir.concat(ecasoundFilterFileName);

function makeEcasoundConfig() {
    execSync(`mkdir -p ${ecasoundChainSetupFileDir}`);
    execSync(`cp ${installLocation}/config_examples/${ecasoundChainSetupFileName} ${ecasoundChainSetupFilePath}`);
    execSync(`cp ${installLocation}/config_examples/${ecasoundFilterFileName} ${ecasoundFilterFilePath}`);
    execSyncPrint(`chown -R ${installLocationUser} ${configFileDir}`);
}

function ensureRustToolchain() {
    let hasRustup = false;

    try {
        const rustupVersion = String(execSync(`bash -lc 'command -v rustup && rustup --version'`)).trim();
        console.log("rustup already installed:", rustupVersion);
        hasRustup = true;
    } catch (error) {
        hasRustup = false;
    }

    if (!hasRustup) {
        console.log("Installing rustup and stable Rust toolchain");
        execSyncPrint(`rm -f /tmp/rustup-init.sh`);
        execSyncPrint(`wget -q https://sh.rustup.rs -O /tmp/rustup-init.sh`);
        execSyncPrint(`bash /tmp/rustup-init.sh -y`);
    }

    execSyncPrint(`bash -lc 'export PATH=/root/.cargo/bin:$PATH; rustup toolchain install stable'`);
    execSyncPrint(`bash -lc 'export PATH=/root/.cargo/bin:$PATH; rustup default stable'`);
    execSyncPrint(`bash -lc 'export PATH=/root/.cargo/bin:$PATH; rustc --version'`);
    execSyncPrint(`bash -lc 'export PATH=/root/.cargo/bin:$PATH; cargo --version'`);
}

function getNtpConfigPath() {
    if (fs.existsSync("/etc/ntpsec/ntp.conf")) {
        return "/etc/ntpsec/ntp.conf";
    }
    return "/etc/ntp.conf";
}

const librespotRepoZip = "https://github.com/mikeszila/librespot/archive/dev.zip";
const librespotCommitApi = "https://api.github.com/repos/mikeszila/librespot/commits/dev";
const librespotCommitFile = `${configFileDir}librespot.commit`;
const librespotBuildDir = "/tmp/librespot";
const librespotBin = `${binLocation}/librespot`;

function getLatestLibrespotCommit() {
    const json = String(execSync(`curl -fsSL ${librespotCommitApi}`));
    const data = JSON.parse(json);
    return data.sha;
}

function getInstalledLibrespotCommit() {
    if (fs.existsSync(librespotCommitFile)) {
        return fs.readFileSync(librespotCommitFile, "utf8").trim();
    }
    return "";
}

function setInstalledLibrespotCommit(commit) {
    execSync(`mkdir -p ${configFileDir}`);
    fs.writeFileSync(librespotCommitFile, `${commit}\n`, "utf8");
}

if (!stopOnly) {
    if (fs.existsSync("/usr/local/etc/smartsoundsyncconf.js")) {
        console.log("found old style config.  Converting to new style at", configFilePath);
        execSync(`mkdir -p /usr/local/etc/smartsoundsync/`);
        execSync(`mv /usr/local/etc/smartsoundsyncconf.js ${configFilePath}`);
    }

    if (fs.existsSync(configFilePath)) {
        console.log("config exists", configFilePath);
    } else {
        execSync(`mkdir -p ${configFileDir}`);
        execSync(`cp ${installLocation}/config_examples/standardconf.js ${configFilePath}`);
        execSyncPrint(`chown -R ${installLocationUser} ${configFileDir}`);
        console.log(`No config found. Created standard config file at ${configFilePath} and default ecasound configuration at ${ecasoundChainSetupFileDir}. Please ensure config is correct for your setup and re-run this script.`);

        makeEcasoundConfig();
        process.exit();
    }

    let settings = require(configFilePath);

    let dependencies = ["ntp"];
    let dependenciesSpotify = ["build-essential"];

    let dependenciesshairport = [
        "build-essential",
        "xmltoman",
        "autoconf",
        "automake",
        "libtool",
        "libdaemon-dev",
        "libpopt-dev",
        "avahi-daemon",
        "libavahi-client-dev",
        "libconfig-dev",
        "libssl-dev"
    ];

    let dependenciessink = [
        "alsa-utils",
        "alsa-tools",
        "libasound2-plugins",
        "ecasound",
        "cmt",
        "swh-plugins",
        "ladspa-sdk",
        "libasound2-dev",
        "cmake"
    ];

    let dependenciesspdif = [
        "evtest",
        "python3-pip",
        "libxslt1-dev",
        "libxml2-dev",
        "zlib1g-dev",
        "python3-lxml",
        "libxml2-dev",
        "libxslt1-dev",
        "libasound2-dev"
    ];

    if (settings.sink) {
        dependencies = dependencies.concat(dependenciessink);

        if (fs.existsSync(ecasoundChainSetupFilePath)) {
            console.log("config exists", ecasoundChainSetupFilePath);
        } else {
            console.log(`No ecasound config file found.  Created standard ecasound config file at ${ecasoundChainSetupFilePath}.  Please ensure config is correct for your setup and re-run this script.`);
            makeEcasoundConfig();
            process.exit();
        }
    }

    if (settings.sources) {
        settings.sources.forEach(function (value, index) {
            if (value.audioSourceType === "Spotify") {
                hasSpotify = true;
            }
            if (value.audioSourceType === "Airplay") {
                hasAirplay = true;
            }
            if (value.audioSourceType === "SPDIF") {
                hasSPDIF = true;
            }
            if (value.hasOwnProperty("HifiberryDacDSP") && value.HifiberryDacDSP === true) {
                hasHifiberryDacDSP = true;
            }
        });
    }

    if (hasAirplay) {
        dependencies = dependencies.concat(dependenciesshairport);
    }

    if (hasSpotify) {
        dependencies = dependencies.concat(dependenciesSpotify);
    }

    if (hasSPDIF) {
        dependencies = dependencies.concat(dependenciesspdif);
    }

    dependencies.forEach(function (value, index) {
        try { execSync(`dpkg -s ${value}`); }
        catch (error) {
            execSyncPrint(`apt install ${value} -y`);
        }
    });

    let ntpConfigTemplate;

    if (settings.ntpServerHostname && settings.ntpServerHostname !== os.hostname()) {
        console.log("getting ntp client config");
        ntpConfigTemplate = fs.readFileSync("./templates/ntp-client-template.conf", "utf8");
        ntpConfigTemplate = ntpConfigTemplate.replaceAll("settings.ntpServerHostname", settings.ntpServerHostname);
    } else {
        console.log("getting ntp server config");
        ntpConfigTemplate = fs.readFileSync("./templates/ntp-server-template.conf", "utf8");
    }

    let ntpConfigPath = getNtpConfigPath();
    let currentNTPconig = "";

    if (fs.existsSync(ntpConfigPath)) {
        currentNTPconig = fs.readFileSync(ntpConfigPath, "utf8");
    }

    if (currentNTPconig !== ntpConfigTemplate) {
        console.log(`ntp config different. Writing new config to ${ntpConfigPath} and restarting NTP`);
        fs.writeFileSync(ntpConfigPath, ntpConfigTemplate, "utf8");
        execSyncPrint(`systemctl restart ntp`);
    } else {
        console.log("no changes to ntp config.  Not restarting NTP.");
    }

    if (settings.sink) {
        if (fs.existsSync(`${installLocation}/pcm`)) {
            console.log("pcm exists, skipping");
        } else {
            execSyncPrint(`gcc pcmblock.c -o /usr/local/bin/pcm -lasound`);
        }

        if (fs.existsSync(`/usr/local/lib/ladspa/RTlowshelf.so`)) {
            console.log("rtaylor filters exist, skipping");
        } else {
            const rtPluginsSourceDir = `${installLocation}/third_party/rt-plugins-0.0.6`;
            const rtPluginsBuildDir = `/tmp/rt-plugins-0.0.6`;

            if (!fs.existsSync(rtPluginsSourceDir)) {
                throw new Error(`Missing required rt-plugins source at ${rtPluginsSourceDir}`);
            }

            execSyncPrint(`rm -rf ${rtPluginsBuildDir}`);
            execSyncPrint(`cp -a ${rtPluginsSourceDir} ${rtPluginsBuildDir}`);
            execSyncPrint(`mkdir -p ${rtPluginsBuildDir}/build`);
            execSyncPrint(`cd ${rtPluginsBuildDir}/build && cmake ..`);
            execSyncPrint(`cd ${rtPluginsBuildDir}/build && make`);
            execSyncPrint(`cd ${rtPluginsBuildDir}/build && make install`);
        }
    }

    if (hasSpotify) {
        ensureRustToolchain();

        const latestCommit = getLatestLibrespotCommit();
        const installedCommit = getInstalledLibrespotCommit();

        if (fs.existsSync(librespotBin) && installedCommit === latestCommit) {
            console.log(`librespot already built at ${latestCommit}, skipping`);
        } else {
            console.log(`compiling librespot ${latestCommit}`);

            try { execSync(`rm -rf ${librespotBuildDir}`); } catch (error) {}
            try { execSync(`rm -rf /tmp/librespot-new`); } catch (error) {}
            try { execSync(`rm -f /tmp/librespot.zip`); } catch (error) {}

            execSyncPrint(`cd /tmp/ && wget -q ${librespotRepoZip} -O ./librespot.zip`);
            execSyncPrint(`cd /tmp/ && unzip -o librespot.zip -d librespot-new`);
            execSyncPrint(`cd /tmp/ && cp -v -a librespot-new/librespot-dev/. librespot`);
            execSyncPrint(`cd /tmp/ && rm -f librespot.zip`);
            execSyncPrint(`cd /tmp/ && rm -rf librespot-new`);
            execSyncPrint(`bash -lc 'export PATH=/root/.cargo/bin:$PATH; cd /tmp/librespot && cargo build --locked --no-default-features --features rustls-tls-native-roots --release'`);
            execSyncPrint(`cp /tmp/librespot/target/release/librespot ${binLocation}/librespot`);

            setInstalledLibrespotCommit(latestCommit);
        }
    }

    if (hasAirplay) {
        if (fs.existsSync(`/usr/local/bin/shairport-sync`)) {
            console.log("shairport exists, skipping");
        } else {
            console.log("compiling shairport");
            try { execSync(`rm -r /tmp/shairport-sync`); }
            catch (error) {}

            execSyncPrint(`cd /tmp/ && wget -q https://github.com/mikeszila/shairport-sync/archive/master.zip -O ./shairport-sync.zip`);
            execSyncPrint(`cd /tmp/ && unzip -o shairport-sync.zip -d shairport-sync-new`);
            execSyncPrint(`cd /tmp/ && cp -v -a shairport-sync-new/shairport-sync-master/. shairport-sync`);
            execSyncPrint(`cd /tmp/ && rm -r shairport-sync-new`);
            execSyncPrint(`cd /tmp/ && rm shairport-sync.zip`);
            execSyncPrint(`cd /tmp/shairport-sync && autoreconf -i -f`);
            execSyncPrint(`cd /tmp/shairport-sync && ./configure --with-avahi --with-ssl=openssl --with-pipe`);
            execSyncPrint(`cd /tmp/shairport-sync && make`);
            execSyncPrint(`cp /tmp/shairport-sync/shairport-sync ${binLocation}/shairport-sync`);
        }
    }

    if (hasSPDIF) {
        if (fs.existsSync(`${installLocation}/pcmrecord`)) {
            console.log("pcmrecord exists, skipping");
        } else {
            execSyncPrint(`gcc pcmrecord.c -o /usr/local/bin/pcmrecord -lasound`);
        }
    }

    if (false && hasHifiberryDacDSP) {
        try { execSync("which dsptoolkit"); }
        catch (error) {
            execSyncPrint(`wget https://raw.githubusercontent.com/hifiberry/hifiberry-dsp/master/install-dsptoolkit -O - | sh`);
        }

        let dspchecksum = String(execSync("dsptoolkit get-checksum"));
        if (dspchecksum.includes("7B03B17AD5B6B1A0E0DACB29BF31F024")) {
            console.log("correct dsp profile installed, skipping");
        } else {
            execSyncPrint("dsptoolkit install-profile https://raw.githubusercontent.com/hifiberry/hifiberry-os/master/buildroot/package/dspprofiles/dspdac-12.xml");
            execSyncPrint("dsptoolkit write-reg 0xF106 0x0003");
            execSyncPrint("dsptoolkit write-reg 0xF146 0x0004");
            execSyncPrint("dsptoolkit write-reg 0xF195 0x0000");
            execSyncPrint("dsptoolkit write-reg 0xF194 0x0033");
            execSyncPrint("dsptoolkit write-reg 0xF21C 0x6C40");
        }
    }

    let serviceName = "";
    let serviceTemplate = "";
    let servicesToStart = [];
    let execArguments = "";
    let priority = 1;

    execArguments = "";

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
RestartSec=5s

[Install]
WantedBy=multi-user.target
`;
    serviceName = `smartsoundsynccommon.service`;

    writeServiceFile(serviceName, serviceTemplate);
    servicesToStart.push(serviceName);

    if (settings.controller) {
        execArguments = "";
        if (settings.controller.length) {
            console.log("control array no code for this yet");
        } else {
            execArguments = `"${execArgumentsParse(settings.controller)}"`;
        }

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
RestartSec=5s

[Install]
WantedBy=multi-user.target
`;
        serviceName = `smartsoundsynccontrol.service`;

        writeServiceFile(serviceName, serviceTemplate);
        servicesToStart.push(serviceName);
    }

    if (settings.sink) {
        execArguments = "";
        if (settings.sink.length) {
            console.log("sink array no code for this yet");
        } else {
            execArguments = `"${execArgumentsParse(settings.sink)}"`;
        }

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
RestartSec=5s

[Install]
WantedBy=multi-user.target
`;
        serviceName = `smartsoundsyncsink.service`;

        writeServiceFile(serviceName, serviceTemplate);
        if (!hasHifiberryDacDSP) { servicesToStart.push(serviceName); }
    }

    if (settings.sources) {
        settings.sources.forEach(function (value, index) {
            let sourceSettings = value;

            if (!sourceSettings.audioSourceDisplayName && sourceSettings.audioSourceClients) {
                if (sourceSettings.audioSourceClients.length > 1) {
                    sourceSettings.audioSourceDisplayName = "";
                    sourceSettings.audioSourceClients.forEach(function (value2, index) {
                        sourceSettings.audioSourceDisplayName = sourceSettings.audioSourceDisplayName.concat(value2.slice(0, 3));
                    });
                } else {
                    sourceSettings.audioSourceDisplayName = sourceSettings.audioSourceClients[0];
                }
            }

            if (sourceSettings.audioSourceType === "SPDIF") {
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
`;
            //    if (os.hostname() === sourceSettings.audioSourceDisplayName) {
           //         serviceName = `smartsoundsyncspdif.service`;
           //     } else {
                    serviceName = `smartsoundsyncspdif${sourceSettings.audioSourceDisplayName}.service`;
           //     }

                writeServiceFile(serviceName, serviceTemplate);
                servicesToStart.push(serviceName);
            }

            if (sourceSettings.audioSourceType === "Spotify") {
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
RestartSec=5s

[Install]
WantedBy=multi-user.target
`;
               // if (os.hostname() === sourceSettings.audioSourceDisplayName) {
              //      serviceName = `smartsoundsyncspotify.service`;
             //   } else {
                    serviceName = `smartsoundsyncspotify${sourceSettings.audioSourceDisplayName}.service`;
            //    }

                writeServiceFile(serviceName, serviceTemplate);
                servicesToStart.push(serviceName);
            }

            if (sourceSettings.audioSourceType === "Airplay") {
                sourceSettings.setupPriority = priority;
                priority = priority + 1;

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
RestartSec=5s

[Install]
WantedBy=multi-user.target
`;
           //     if (os.hostname() === sourceSettings.audioSourceDisplayName) {
           //         serviceName = `smartsoundsyncairplay.service`;
            //    } else {
                    serviceName = `smartsoundsyncairplay${sourceSettings.audioSourceDisplayName}.service`;
           //     }

                writeServiceFile(serviceName, serviceTemplate);
                servicesToStart.push(serviceName);
            }
        });
    }

    execSyncPrint(`systemctl daemon-reload`);

    servicesToStart.forEach(function (value, index) {
        serviceStart(value);
    });
}

execSyncPrint(`chown -R ${installLocationUser} ${installLocation}`);
execSyncPrint(`chown -R ${installLocationUser} ${configFileDir}`);