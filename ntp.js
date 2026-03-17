"use strict";

const dgram = require("dgram");
const fs = require("fs");
const os = require("os");
const { execSync } = require("child_process");

const hostname = os.hostname();

let settings = {
    ntpServerHostname: hostname,
    ntpStatusPort: 5657,
    remoteNtpStatusHostname: false,
    statusIntervalMs: 30000
};

let cmdlineSTR = String(process.argv);
let cmdSettingsJSON = cmdlineSTR.slice(cmdlineSTR.lastIndexOf("{"), cmdlineSTR.lastIndexOf("}") + 1);

if (cmdSettingsJSON != 0) {
    let cmdSettingsObj = JSON.parse(String(cmdSettingsJSON));
    settings = { ...settings, ...cmdSettingsObj };
}

const localStatusTextPath = "/tmp/smartsoundsync-ntp-status.txt";
const localStatusJsonPath = "/tmp/smartsoundsync-ntp-status.json";
const aggregateStatusTextPath = "/tmp/smartsoundsync-ntp-clients.txt";
const aggregateStatusJsonPath = "/tmp/smartsoundsync-ntp-clients.json";

let latestLocalStatus = false;
let aggregateStatuses = {};

const socketNtpStatus = dgram.createSocket({ type: "udp4", reuseAddr: true });

socketNtpStatus.on("error", (err) => {
    console.log(`socketNtpStatus error:\n${err.stack}`);
});

socketNtpStatus.on("listening", () => {
    let address = socketNtpStatus.address();
    console.log(`socketNtpStatus listening ${address.address}:${address.port}`);
});

socketNtpStatus.on("message", (message, remote) => {
    try {
        let messageObj = JSON.parse(String(message));

        if (messageObj.type !== "NtpStatus" || !messageObj.status || !messageObj.status.hostname) {
            return;
        }

        let status = messageObj.status;
        status.reportedBy = messageObj.reportedBy || remote.address;
        aggregateStatuses[status.hostname] = status;

        writeAggregateStatusFiles();
        forwardStatusUpstream(status);
    } catch (error) {
        console.log("Error parsing NTP status message", error);
    }
});

socketNtpStatus.bind(settings.ntpStatusPort);

function writeFile(path, data) {
    try {
        fs.writeFileSync(path, data, "utf8");
    } catch (error) {
        console.log("Error writing", path, error);
    }
}

function safeNumber(value, decimals) {
    if (typeof value !== "number" || Number.isNaN(value)) {
        return "n/a";
    }

    return value.toFixed(decimals);
}

function extractSelectedPeerLine(ntpqOutput) {
    let lines = ntpqOutput.split(/\r?\n/);

    for (let index = 0; index < lines.length; index = index + 1) {
        let line = lines[index].trim();

        if (line.startsWith("*") || line.startsWith("o")) {
            return lines[index];
        }
    }

    return false;
}

function parsePeerLine(peerLine) {
    let trimmedLine = peerLine.trim();
    let tally = trimmedLine.slice(0, 1);
    let lineWithoutTally = trimmedLine.slice(1).trim();
    let parts = lineWithoutTally.split(/\s+/);

    return {
        tally: tally,
        remote: parts[0] || "",
        refid: parts[1] || "",
        stratum: Number(parts[2]),
        poll: Number(parts[5]),
        reach: parts[6] || "",
        delay: Number(parts[7]),
        offset: Number(parts[8]),
        jitter: Number(parts[9])
    };
}

function getStateFromOutput(ntpqOutput, selectedPeer) {
    if (selectedPeer) {
        if (selectedPeer.remote === settings.ntpServerHostname) {
            return "synced";
        }

        return "fallback";
    }

    if (ntpqOutput.includes(".XFAC.")) {
        return "xfac";
    }

    if (ntpqOutput.includes(".INIT.")) {
        return "init";
    }

    return "unknown";
}

function buildSummaryLine(status) {
    let source = status.selectedPeer ? status.selectedPeer.remote : "none";

    return [
        status.hostname,
        "state=" + status.state,
        "source=" + source,
        "offset=" + safeNumber(status.offset, 3) + " ms",
        "jitter=" + safeNumber(status.jitter, 3) + " ms",
        "reach=" + (status.reach || "n/a"),
        "poll=" + (status.poll || "n/a")
    ].join("  ");
}

function readLocalNtpStatus() {
    let ntpqOutput = "";

    try {
        ntpqOutput = String(execSync("ntpq -pn", { stdio: ["ignore", "pipe", "pipe"] }));
    } catch (error) {
        return {
            type: "NtpStatus",
            hostname: hostname,
            timestamp: new Date().toISOString(),
            state: "error",
            ntpServerHostname: settings.ntpServerHostname,
            selectedPeer: false,
            offset: false,
            jitter: false,
            delay: false,
            poll: false,
            reach: false,
            summaryLine: `${hostname}  state=error  source=none  offset=n/a  jitter=n/a  reach=n/a  poll=n/a`
        };
    }

    let selectedPeerLine = extractSelectedPeerLine(ntpqOutput);
    let selectedPeer = false;

    if (selectedPeerLine) {
        selectedPeer = parsePeerLine(selectedPeerLine);
    }

    let status = {
        type: "NtpStatus",
        hostname: hostname,
        timestamp: new Date().toISOString(),
        state: getStateFromOutput(ntpqOutput, selectedPeer),
        ntpServerHostname: settings.ntpServerHostname,
        selectedPeer: selectedPeer,
        offset: selectedPeer ? selectedPeer.offset : false,
        jitter: selectedPeer ? selectedPeer.jitter : false,
        delay: selectedPeer ? selectedPeer.delay : false,
        poll: selectedPeer ? selectedPeer.poll : false,
        reach: selectedPeer ? selectedPeer.reach : false,
        rawNtpq: ntpqOutput.trim()
    };

    status.summaryLine = buildSummaryLine(status);

    return status;
}

function writeLocalStatusFiles(status) {
    let textLines = [
        `NTP Status ${status.timestamp}`,
        "",
        status.summaryLine,
        ""
    ];

    if (status.rawNtpq) {
        textLines.push(status.rawNtpq);
        textLines.push("");
    }

    writeFile(localStatusTextPath, textLines.join("\n"));
    writeFile(localStatusJsonPath, JSON.stringify(status, null, 2).concat("\n"));
}

function buildAggregateText() {
    let statuses = Object.values(aggregateStatuses);

    statuses.sort(function (a, b) {
        return a.hostname.localeCompare(b.hostname);
    });

    let lines = [
        `NTP Client Status ${new Date().toISOString()}`,
        ""
    ];

    statuses.forEach(function (status) {
        lines.push(status.summaryLine || buildSummaryLine(status));
    });

    lines.push("");

    return lines.join("\n");
}

function writeAggregateStatusFiles() {
    writeFile(aggregateStatusTextPath, buildAggregateText());
    writeFile(aggregateStatusJsonPath, JSON.stringify(aggregateStatuses, null, 2).concat("\n"));
}

function sendStatusToHost(status, targetHostname) {
    if (!targetHostname || targetHostname === hostname) {
        return;
    }

    let messageObject = {
        type: "NtpStatus",
        reportedBy: hostname,
        status: status
    };

    let messageBuffer = Buffer.from(JSON.stringify(messageObject));

    socketNtpStatus.send(
        messageBuffer,
        0,
        messageBuffer.length,
        settings.ntpStatusPort,
        targetHostname,
        function (err) {
            if (err) {
                console.log("could not send NTP status to", targetHostname, err.message);
            }
        }
    );
}

function forwardStatusUpstream(status) {
    if (!settings.remoteNtpStatusHostname || settings.remoteNtpStatusHostname === hostname) {
        return;
    }

    if (status.hostname === hostname) {
        return;
    }

    sendStatusToHost(status, settings.remoteNtpStatusHostname);
}

function collectAndPublishLocalStatus() {
    latestLocalStatus = readLocalNtpStatus();
    aggregateStatuses[latestLocalStatus.hostname] = latestLocalStatus;
    writeLocalStatusFiles(latestLocalStatus);
    writeAggregateStatusFiles();
    sendStatusToHost(latestLocalStatus, settings.remoteNtpStatusHostname);
}

collectAndPublishLocalStatus();
setInterval(collectAndPublishLocalStatus, settings.statusIntervalMs);
