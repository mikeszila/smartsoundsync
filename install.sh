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

echo $PWD
wget -q https://github.com/mikeszila/smartsoundsync/archive/main.zip -O /usr/local/src/main.zip
unzip -o /usr/local/src/main.zip -d /usr/local/src/smartsoundsync-new
cp -v -a /usr/local/src/smartsoundsync-new/smartsoundsync-main/. /usr/local/src/smartsoundsync/
rm /usr/local/src/main.zip
rm -r /usr/local/src/smartsoundsync-new
rm /usr/local/src/smartsoundsync/install.sh  #remove this script from the local project directory so someone doesn't get confused, run it, and install the application again inside itself.  
node /usr/local/src/smartsoundsync/install-setup.js


