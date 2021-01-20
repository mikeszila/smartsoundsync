#!/bin/bash

systemctl stop triggerhappy 
systemctl stop dbus 
killall console-kit-daemon
killall polkitd
sudo mount -o remount,size=128M /dev/shm
killall gvfsd
killall dbus-daemon
killall dbus-launch
echo -n performance | tee /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
/sbin/sysctl -w vm.swappiness=10