#!/bin/bash
# smartsoundsync installer
# https://github.com/mikeszila/smartsoundsync

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
	if [[ ! -e /usr/bin/nodejs ]]; then
		echo "Installing nodejs"
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

rm -r /tmp/smartsoundsync
mkdir /tmp/smartsoundsync
wget -q https://github.com/mikeszila/smartsoundsync/archive/develop.zip -O /tmp/smartsoundsync/develop.zip
unzip -o /tmp/smartsoundsync/develop.zip -d /tmp/smartsoundsync/smartsoundsync-new
rm -r /usr/local/lib/smartsoundsync/
cp -v -a /tmp/smartsoundsync/smartsoundsync-new/smartsoundsync-develop/. /usr/local/lib/smartsoundsync/
sudo chown -R  $(stat -c "%U" $PWD) /usr/local/lib/smartsoundsync/  
cd /usr/local/lib/smartsoundsync/ && node install-setup.js


