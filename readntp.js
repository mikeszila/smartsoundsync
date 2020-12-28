global.ntpCorrection
const { spawn } = require('child_process');

function spawnReadNTP() {
    ntpRead = spawn('./readntp.sh');
    ntpRead.stdout.on('data', (data) => {
        ntpCorrection = 1 + (1 / (1000000 / Number(data)))
      //console.log(ntpCorrection)
    });
    ntpRead.stderr.on('data', (data) => {
      console.log('stderr ntp', String(data))
    });
    ntpRead.on('close', (code) => {
      console.log('ntp', 'close', String(code))   
    });
    common.setPriority(ntpRead.pid, 0)
  }

  spawnReadNTP()
  