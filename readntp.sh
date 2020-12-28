#!/bin/bash

while true; do

#date1="$(date +%s.%N)"
#cardStatus="$(cat /proc/asound/card0/pcm0c/sub0/status)"
#date2="$(date +%s.%N)"

ntpDrift="$(cat /var/lib/ntp/ntp.drift)"

output="$ntpDrift"

echo "$output" | tr '\n' ' '

sleep 10
done