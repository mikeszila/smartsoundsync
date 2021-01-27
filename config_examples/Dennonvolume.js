console.log('big hellohi!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!11')


const { exec, spawn, execSync } = require('child_process');
execSync('npm install marantz-denon-telnet')



var MarantzDenonTelnet = require('marantz-denon-telnet');


var mdt = new MarantzDenonTelnet('192.168.20.40');

let volume_dennon_max = 80
let volume_dennon_min = 0

let volume_db_max = 0
let volume_db_min = -80



function set_volume(volume_db) {

  /*
  command = '\"amixer\" sset PCM -- '
  command = command.concat(0, 'dB')

  child = exec(command, function (error, stdout, stderr) {
    console.log('stdout: ' + stdout);
    console.log('stderr: ' + stderr);
    
    if (error !== null) {
      console.log('exec error: ' + error);
    }
  });
  */

  volume_dennon = (volume_dennon_min - volume_dennon_max) / (volume_db_min - volume_db_max) * (volume_db - volume_db_min) + volume_dennon_min
  volume_dennon = volume_dennon.toString()
  volume_dennon = volume_dennon.slice(0, 2)
  //volume_dennon = volume_dennon - 6
  //volume_dennon = 0
  console.log('Dennon Volume ///////////////////////////', volume_db, volume_dennon)


  command = 'MV'
  command = command.concat(volume_dennon)

  mdt.cmd(command, function (error, ret) {
    //console.log(error ? error : '')
    console.log(ret)

  })
}

function setInput() {  //receiver sits on the floor in the corner where kids can reach the buttons... This makes sure the input is bluray and surround processing is off every 10 seconds. 
  mdt.cmd('SI?', function (error, ret) {
    if (ret.indexOf('SIBD') == -1) {
      console.log(ret, 'setting source to BD')
      mdt.cmd('SIBD', function (error, ret) {
        console.log('set source to BD')
      })
    } else {
      mdt.cmd('MS?', function (error, ret) {
        if (ret.indexOf('MSDIRECT') == -1) {
          console.log(ret, 'setting surround mode to MSDIRECT')
          mdt.cmd('MSDIRECT', function (error, ret) {
            console.log('set surround mode to MSDIRECT')
          })
        }
      })
    }
  })
}

setInterval(setInput, 10000)

module.exports = {
  set_volume
}


