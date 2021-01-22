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

function installUnbound() {
	# If Unbound isn't installed, install it
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
installUnbound

echo $PWD
wget -q https://github.com/mikeszila/smartsoundsync/archive/main.zip -O ./main.zip
unzip -o main.zip -d smartsoundsync-new
mv -f smartsoundsync-new/smartsoundsync-main smartsoundsync
rm main.zip
rm -r smartsoundsync-new
cd smartsoundsync
node install-setup.js


