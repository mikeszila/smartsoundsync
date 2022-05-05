const { SerialPort } = require('/usr/lib/node_modules/serialport')
const { ReadlineParser } = require('@serialport/parser-readline')

const port = new SerialPort({ path: '/dev/serial/by-id/usb-Prolific_Technology_Inc._USB-Serial_Controller-if00-port0', baudRate: 9600 })

// Open errors will be emitted as an error event
port.on('error', function (err) {
    process.send(`Error: ${err.message}`)
})

const parser = port.pipe(new ReadlineParser({ delimiter: '\r' }))

parser.on('data', function (data) {
    process.send(`Received: ${data}`)
})

function send_command(command) {



    port.write(command + "\r", function (err) {
        if (err) {
            return console.log('Error on write: ', err.message)
        }
        process.send(`Sent: ${command}`)
    })

}

process.on("message", function (message) {
    data = String(message)
    //data = data.slice(0, data.length - 1)
    send_command(data)
});
