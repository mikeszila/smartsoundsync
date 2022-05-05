

let volume_dennon_max = 90
let volume_dennon_min = 0

volume_db_min = -80
 

function set_volume(volume_db, selectedSource) {

  if (selectedSource) {
    if (selectedSource.hostname == hostname) {
      volume_dennon_max = 98
      volume_db_min = settings.volume_db_min
    } else {
      volume_dennon_max = 90
      volume_db_min = -80
    }
  }

  volume_dennon = (volume_dennon_min - volume_dennon_max) / (volume_db_min - settings.volume_db_max) * (volume_db - volume_db_min) + volume_dennon_min

  
  volume_dennon = String(Math.round(volume_dennon))
  //volume_dennon = volume_dennon - 6
  //volume_dennon = 0

  if (volume_dennon > volume_dennon_max) {
    volume_dennon = volume_dennon_max
  }

  if (volume_dennon < volume_dennon_min) {
    volume_dennon = volume_dennon_min
  }

  

  command = 'MV'
  if (volume_dennon == 0) {
    command = 'MU'
    volume_dennon = 'ON'
  } else {

    if (volume_dennon.length < 2) {
      test = '0'
      volume_dennon = test.concat(volume_dennon)
    }
  }



  command = command.concat(volume_dennon)

  console.log('Volume db:', volume_db, 'Dennon Volume:', volume_dennon, 'command: ', command)

  serialHandler.send(command);
}

var fork = require('child_process').fork;
var serialHandler = fork('/home/michael/DennonvolumeSerialHandler.js')

serialHandler.on("close", function (code) {
  console.log("serialHandler process exited with code " + code);
});

serialHandler.on("message", function (message) {
  console.log(`serialHandler - ${message}`);
});

module.exports = {
  set_volume
}

