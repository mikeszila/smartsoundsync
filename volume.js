const { exec, spawn, execSync } = require('child_process');

var child;

//alsaVolumeControlName: 'DSPVolume',  //the name of the alsa volume control to adjust volume of your speakers.  look in alsamixer for the name. 
//  alsaVolumeControlUnit: '',      // hopefully your volume control supports decibels.  If not you'll get an error.  Set this to empty string and find the min and max values for your volume control and enter them below. User amixer -c "card number here" to find these values.   
//volumeOutMax: 255,  //This is the value sent to your volume control at max volume.  If your card supports db leave this alone.  
//volumeOutMin: 0,

if (settings.soundCardSupportsDecibels) {
  settings.alsaVolumeControlUnit = 'dB'
  settings.volumeOutMin = -60
  settings.volumeOutMax = 0
}

if (!settings.alsaVolumeControlUnit) {
  settings.alsaVolumeControlUnit = ""
}

var amixer

function set_volume(volume_db, selectedSource) {
  let volumeOut = (settings.volumeOutMin - settings.volumeOutMax) / (settings.volume_db_min - settings.volume_db_max) * (volume_db - settings.volume_db_min) + settings.volumeOutMin;

  console.log("VOLUMESET", volumeOut, settings.alsaVolumeControlName, settings.alsaVolumeControlUnit);

  let volumeProcess;

  if (settings.alsaVolumeControlName === "dsptoolkit") {
    let dspVolumeArg = `${volumeOut}${settings.alsaVolumeControlUnit}`;

    volumeProcess = spawn("dsptoolkit", ["set-volume", "--", dspVolumeArg]);
  } else {
    volumeProcess = spawn("amixer", [
      "-D",
      settings.cardName,
      "sset",
      settings.alsaVolumeControlName,
      "--",
      `${volumeOut}${settings.alsaVolumeControlUnit}`
    ]);
  }

  volumeProcess.stdout.on("data", (data) => {
    // console.log("volume stdout", String(data));
  });

  volumeProcess.stderr.on("data", (data) => {
    // console.log("volume stderr", String(data));
  });
}

module.exports = {
  set_volume
}