//This file is a stub for you to do something with volume control changes.  Look at /usr/local/lib/smartsoundsync/config_examples/Dennonvolume.js for how I write volume to my receiver.
// or /usr/local/lib/smartsoundsync/volume.js for how to write to the alsa mixer. 
let volume_scaled_max = 80
let volume_scaled_min = 0

let volume_db_max = 0
let volume_db_min = -80

function set_volume(volume_db) {

  volume_scaled = (volume_scaled_min - volume_scaled_max) / (volume_db_min - volume_db_max) * (volume_db - volume_db_min) + volume_scaled_min
  volume_scaled = volume_scaled.toString()
  volume_scaled = volume_scaled.slice(0, 2)

  console.log('smartsoundsync Volume ///////////////////////////', volume_db, volume_scaled)

  //run 'journalctl -u smartsoundsyncsink -f' to see this log data

}

module.exports = {
  set_volume
}


