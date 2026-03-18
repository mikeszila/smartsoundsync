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
const localHistoryPath = "/tmp/smartsoundsync-ntp-history.jsonl";
const aggregateStatusTextPath = "/tmp/smartsoundsync-ntp-clients.txt";
const aggregateStatusJsonPath = "/tmp/smartsoundsync-ntp-clients.json";
const aggregateHistoryPath = "/tmp/smartsoundsync-ntp-clients-history.jsonl";

let latestLocalStatus = false;
let aggregateStatuses = {};
let resolvedHosts = {};
let historyByHostname = {};
const historyLimitPerHost = 240;

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
        enrichStatusWithHistory(status);
        status.summaryLine = buildSummaryLine(status);
        aggregateStatuses[status.hostname] = status;

        appendHistoryLine(aggregateHistoryPath, buildHistoryEntry(status));
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

function appendHistoryLine(path, dataObject) {
    try {
        fs.appendFileSync(path, JSON.stringify(dataObject).concat("\n"), "utf8");
    } catch (error) {
        console.log("Error appending", path, error);
    }
}

function safeNumber(value, decimals) {
    if (typeof value !== "number" || Number.isNaN(value)) {
        return "n/a";
    }

    return value.toFixed(decimals);
}

function getHistoryList(hostnameToFind) {
    if (!historyByHostname[hostnameToFind]) {
        historyByHostname[hostnameToFind] = [];
    }

    return historyByHostname[hostnameToFind];
}

function loadHistoryFile(path) {
    if (!fs.existsSync(path)) {
        return;
    }

    try {
        let fileData = fs.readFileSync(path, "utf8");
        let lines = fileData.split(/\r?\n/);

        lines.forEach(function (line) {
            if (!line.trim()) {
                return;
            }

            let entry = JSON.parse(line);
            let historyList = getHistoryList(entry.hostname);
            historyList.push(entry);

            if (historyList.length > historyLimitPerHost) {
                historyList.splice(0, historyList.length - historyLimitPerHost);
            }
        });
    } catch (error) {
        console.log("Error loading history file", path, error);
    }
}

function getAgeSeconds(timestamp) {
    if (!timestamp) {
        return false;
    }

    let ageMS = Date.now() - new Date(timestamp).getTime();
    return ageMS / 1000;
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

function resolveHostname(hostnameToResolve) {
    if (!hostnameToResolve) {
        return [];
    }

    if (resolvedHosts[hostnameToResolve]) {
        return resolvedHosts[hostnameToResolve];
    }

    let resolvedAddressList = [hostnameToResolve];

    try {
        let lookupOutput = String(execSync(`getent ahostsv4 ${hostnameToResolve}`, { stdio: ["ignore", "pipe", "pipe"] }));
        let outputLines = lookupOutput.split(/\r?\n/);

        outputLines.forEach(function (line) {
            let parts = line.trim().split(/\s+/);

            if (parts[0] && !resolvedAddressList.includes(parts[0])) {
                resolvedAddressList.push(parts[0]);
            }
        });
    } catch (error) {
    }

    resolvedHosts[hostnameToResolve] = resolvedAddressList;

    return resolvedAddressList;
}

function peerMatchesHost(peerRemote, hostnameToMatch) {
    if (!peerRemote || !hostnameToMatch) {
        return false;
    }

    let matchValues = resolveHostname(hostnameToMatch);
    return matchValues.includes(peerRemote);
}

function getSecondaryNtpHostname() {
    if (
        settings.remoteNtpStatusHostname &&
        settings.remoteNtpStatusHostname !== hostname &&
        settings.remoteNtpStatusHostname !== settings.ntpServerHostname
    ) {
        return settings.remoteNtpStatusHostname;
    }

    return false;
}

function getStateFromOutput(ntpqOutput, selectedPeer) {
    if (selectedPeer) {
        if (hostname === settings.ntpServerHostname) {
            return "server_upstream";
        }

        if (peerMatchesHost(selectedPeer.remote, settings.ntpServerHostname)) {
            return "synced_primary";
        }

        let secondaryNtpHostname = getSecondaryNtpHostname();
        if (secondaryNtpHostname && peerMatchesHost(selectedPeer.remote, secondaryNtpHostname)) {
            return "synced_secondary";
        }

        return "fallback_pool";
    }

    if (ntpqOutput.includes(".XFAC.")) {
        return "xfac";
    }

    if (ntpqOutput.includes(".INIT.")) {
        return "init";
    }

    return "unknown";
}

function buildHistoryEntry(status) {
    return {
        hostname: status.hostname,
        timestamp: status.timestamp,
        state: status.state,
        selectedPeerRemote: status.selectedPeer ? status.selectedPeer.remote : false,
        offset: status.offset,
        jitter: status.jitter,
        delay: status.delay,
        poll: status.poll,
        reach: status.reach,
        reportedBy: status.reportedBy || status.hostname
    };
}

function enrichStatusWithHistory(status) {
    let historyList = getHistoryList(status.hostname);
    let previousStatus = false;

    if (historyList.length > 0) {
        previousStatus = historyList[historyList.length - 1];
    }

    status.ageSeconds = getAgeSeconds(status.timestamp);
    status.offsetDelta = false;
    status.peerChanged = false;
    status.stateChanged = false;
    status.stepChange = false;
    status.largeStepChange = false;

    if (previousStatus) {
        if (typeof previousStatus.offset === "number" && typeof status.offset === "number") {
            status.offsetDelta = status.offset - previousStatus.offset;
            status.stepChange = Math.abs(status.offsetDelta) >= 0.25;
            status.largeStepChange = Math.abs(status.offsetDelta) >= 0.5;
        }

        status.peerChanged = previousStatus.selectedPeerRemote !== (status.selectedPeer ? status.selectedPeer.remote : false);
        status.stateChanged = previousStatus.state !== status.state;
    }

    let historyEntry = buildHistoryEntry(status);
    historyList.push(historyEntry);

    if (historyList.length > historyLimitPerHost) {
        historyList.splice(0, historyList.length - historyLimitPerHost);
    }

    let maxOffsetJump = 0;
    for (let index = 1; index < historyList.length; index = index + 1) {
        let previousEntry = historyList[index - 1];
        let currentEntry = historyList[index];

        if (typeof previousEntry.offset === "number" && typeof currentEntry.offset === "number") {
            let jump = Math.abs(currentEntry.offset - previousEntry.offset);
            if (jump > maxOffsetJump) {
                maxOffsetJump = jump;
            }
        }
    }

    status.maxOffsetJump = maxOffsetJump;
}

function buildSummaryLine(status) {
    let source = status.selectedPeer ? status.selectedPeer.remote : "none";

    let summaryParts = [
        status.hostname,
        "state=" + status.state,
        "source=" + source,
        "offset=" + safeNumber(status.offset, 3) + " ms",
        "jitter=" + safeNumber(status.jitter, 3) + " ms",
        "reach=" + (status.reach || "n/a"),
        "poll=" + (status.poll || "n/a")
    ];

    if (typeof status.ageSeconds === "number") {
        summaryParts.push("age=" + safeNumber(status.ageSeconds, 0) + " s");
    }

    if (typeof status.offsetDelta === "number") {
        summaryParts.push("delta=" + safeNumber(status.offsetDelta, 3) + " ms");
    }

    if (typeof status.maxOffsetJump === "number") {
        summaryParts.push("maxJump=" + safeNumber(status.maxOffsetJump, 3) + " ms");
    }

    if (status.peerChanged) {
        summaryParts.push("peerChange=yes");
    }

    if (status.stateChanged) {
        summaryParts.push("stateChange=yes");
    }

    if (status.largeStepChange) {
        summaryParts.push("step=large");
    } else if (status.stepChange) {
        summaryParts.push("step=yes");
    }

    return summaryParts.join("  ");
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
            secondaryNtpHostname: getSecondaryNtpHostname(),
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
        secondaryNtpHostname: getSecondaryNtpHostname(),
        selectedPeer: selectedPeer,
        offset: selectedPeer ? selectedPeer.offset : false,
        jitter: selectedPeer ? selectedPeer.jitter : false,
        delay: selectedPeer ? selectedPeer.delay : false,
        poll: selectedPeer ? selectedPeer.poll : false,
        reach: selectedPeer ? selectedPeer.reach : false,
        rawNtpq: ntpqOutput.trim()
    };

    enrichStatusWithHistory(status);
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
    appendHistoryLine(localHistoryPath, buildHistoryEntry(latestLocalStatus));
    appendHistoryLine(aggregateHistoryPath, buildHistoryEntry(latestLocalStatus));
    writeLocalStatusFiles(latestLocalStatus);
    writeAggregateStatusFiles();
    sendStatusToHost(latestLocalStatus, settings.remoteNtpStatusHostname);
}

loadHistoryFile(aggregateHistoryPath);
collectAndPublishLocalStatus();
setInterval(collectAndPublishLocalStatus, settings.statusIntervalMs);
