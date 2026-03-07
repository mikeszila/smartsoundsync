#!/bin/bash
# smartsoundsync installer
# https://github.com/mikeszila/smartsoundsync

set -e

function isRoot() {
	if [ "$EUID" -ne 0 ]; then
		return 1
	fi
}

function initialCheck() {
	if ! isRoot; then
		echo "Please run this as root"
		exit 1
	fi
}

function installStuff() {
	if [[ ! -e /usr/bin/curl ]]; then
		echo "Installing curl"
		apt-get update
		apt-get install -y curl
	else
	    echo "curl already installed"
	fi

	if [[ ! -e /usr/bin/node ]]; then
		echo "Installing Node.js LTS"
		curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
		apt-get install -y nodejs
	else
	    echo "nodejs already installed"
	fi

	if [[ ! -e /usr/bin/unzip ]]; then
		echo "Installing unzip"
		apt-get install -y unzip
	else
	    echo "unzip already installed"
	fi
}		

initialCheck
installStuff

rm -rf /tmp/smartsoundsync
mkdir -p /tmp/smartsoundsync
wget -q https://github.com/mikeszila/smartsoundsync/archive/develop.zip -O /tmp/smartsoundsync/develop.zip
unzip -o /tmp/smartsoundsync/develop.zip -d /tmp/smartsoundsync/smartsoundsync-new
rm -rf /usr/local/lib/smartsoundsync
mkdir -p /usr/local/lib/smartsoundsync
cp -v -a /tmp/smartsoundsync/smartsoundsync-new/smartsoundsync-develop/. /usr/local/lib/smartsoundsync/
chown -R "$(stat -c "%U" "$PWD")" /usr/local/lib/smartsoundsync/
cd /usr/local/lib/smartsoundsync && npm install
cd /usr/local/lib/smartsoundsync && node install-setup.js