const { client, circularParser } = require('../../socket/lib/browser')

const connect = (host, path, extraOpts = {}) => {
  return client.connect(host, {
    path,
    transports: ['websocket'],
    // @ts-ignore
    parser: circularParser,
    ...extraOpts,
  })
}

module.exports = {
  connect,

  socketIoClient: client,

  socketIoParser: circularParser,
}
