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
    let key = {
      '_id': 'QmU6UF1tUpJf9z6fuN5YiGhyx4vHBtqsMn5binVfa7Z5mj',
      'Img': 'QmXoumq5cxfseeAznvoZ8ymoFj4Y2jrq6pSNugUy61qrWr',
      'Name': '流浪地球',
      'Label': '科幻,灾难',
      'Type': 'video',
      'Desc': '《流浪地球》根据刘慈欣同名小说改编，影片故事设定在2075年，讲述了太阳即将毁灭，已经不适合人类生存，而面对绝境，人类将开启“流浪地球”计划，试图带着地球一起逃离太阳系，寻找人类新家园的故事',
      'timestamp': 1550388678,
      'author': '0x679d232bd529f23fc4586f22b17e4934c8450ef8'
    }
    const db = global.db
    db.keys.insert(key)
    key = {
      '_id': 'QmW4G159bEtytj52Z6EzxoVZ5RXwr3pAer9Wg1ie9gVzmD',
      'Img': 'QmeV9LDY7bJxxhR4Vd89dKo7Bt5YzMkCCenHqAjJcRQALa',
      'Name': '廉政风云',
      'Label': '犯罪,悬疑',
      'Type': 'video',
      'Desc': '该片讲述了香港廉政公署一桩重要案件证人出逃，负责案件的调查员需想尽办法将其找回，却不料在证人将回港之际，出现了意想不到的波折的故事',
      'timestamp': 1550388678,
      'author': '0x679d232bd529f23fc4586f22b17e4934c8450ef8'
    }
    db.keys.insert(key)
    let keys = db.keys
      .chain()
      .simplesort('timestamp', true)
      .data()
    global.windows.broadcast(Types.SYNC_TRANSACTION, { keys })
  }
}

export default new KeyState()
