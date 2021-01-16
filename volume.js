const { exec, spawn, execSync } = require('child_process');

var child;

let volume_db_max = 0
let volume_db_min = -60

let volumeOutMax = 255
let volumeOutMin = 0

var amixer

function set_volume(volume_db) {

  //let volumeOut = (volumeOutMin - volumeOutMax) / (volume_db_min - volume_db_max) * (volume_db - volume_db_min) + volumeOutMin


  console.log('VOLUMESET', volume_db)

  amixer = spawn('amixer', ['sset', 'Digital', '--', `${volume_db}db`]);

  amixer.stdout.on('data', (data) => {
    //console.log('amixer stdout', String(data))
  });

  amixer.stderr.on('data', (data) => {
    //console.log('amixer stderr', String(data))
  });


}


module.exports = {
  set_volume
}