import { EventEmitter } from 'events'

import { Types } from '../ipc/types'
import logger from '../logger'

const log = logger.create('KeyState')

class KeyState extends EventEmitter {
  constructor () {
    super()
    this.on('sync', this._sync)
  }

  _sync () {
    log.info('load keys from db')
    const db = global.db
    let keys = db.keys
      .chain()
      .simplesort('timestamp', true)
      .data()
    global.windows.broadcast(Types.SYNC_TRANSACTION, { keys })
  }
}

export default new KeyState()
