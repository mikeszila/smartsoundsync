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

wget -q https://github.com/mikeszila/smartsoundsync/archive/main.zip -O /usr/local/lib/main.zip
unzip -o /usr/local/lib/main.zip -d /usr/local/lib/smartsoundsync-new
cp -v -a /usr/local/lib/smartsoundsync-new/smartsoundsync-main/. /usr/local/lib/smartsoundsync/
rm /usr/local/lib/main.zip
rm -r /usr/local/lib/smartsoundsync-new
rm /usr/local/lib/smartsoundsync/install.sh  #remove this script from the local project directory so someone doesn't get confused, run it, and install the application again inside itself.  
cd /usr/local/lib/smartsoundsync/ && node install-setup.js


