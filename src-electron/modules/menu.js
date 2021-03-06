import { Menu, app } from 'electron'
import i18n from 'i18next'
import zh from './i18n/flu.zh.i18n.json'
import en from './i18n/flu.en.i18n.json'
import { Types } from '../modules/ipc/types'
import path from 'path'
import fs from 'fs'
import settings from './settings'
import indexchainNode from '../modules/indexchainNode'
import Q from 'bluebird'
import clientBinaryManager from '../modules/clientBinaryManager'
import stateManager from '../modules/stateManager'
import observeManager from '../modules/observeManager'
import nodeSync from '../modules/nodeSync'
import logger from '../modules/logger'
import rimraf from 'rimraf'
const log = logger.create('Menu')

const resources = {
  dev: { translation: zh },
  en: { translation: en },
  zh: { translation: zh }
}

class FluMenu {
  constructor (mwin) {
    this.mwin = mwin
    i18n.getBestMatchedLangCode = langCode => {
      const codeList = Object.keys(resources)
      let bestMatchedCode = langCode
      if (codeList.indexOf(langCode) === -1) {
        if (codeList.indexOf(langCode.substr(0, 2)) > -1) {
          bestMatchedCode = langCode.substr(0, 2)
        } else {
          bestMatchedCode = 'en'
        }
      }
      return bestMatchedCode
    }

    let lan = app.getLocale()

    lan = lan.indexOf('zh') !== -1 ? 'zh' : 'en'

    global.language = lan

    i18n.init({
      lng: lan || 'zh',
      resources,
      interpolation: { prefix: '__', suffix: '__' }
    })
    global.i18n = i18n
  }

  kickStart (restart) {
    // client binary stuff
    clientBinaryManager.on('status', (status, data) => {
      global.windows.broadcast(Types.UI_ACTION_CLIENTBINARYSTATUS, status, data)
    })

    // node connection stuff
    indexchainNode.on('nodeConnectionTimeout', () => {
      global.windows.broadcast(Types.UI_ACTION_NODE_STATUS, 'connectionTimeout')
    })

    indexchainNode.on('nodeLog', data => {
      global.windows.broadcast(Types.UI_ACTION_NODE_LOGTEXT, data.replace(/^.*[0-9]]/, ''))
    })

    // state change
    indexchainNode.on('state', (state, stateAsText) => {
      global.windows.broadcast(
        'uiAction_nodeStatus',
        stateAsText,
        indexchainNode.STATES.ERROR === state ? indexchainNode.lastError : null
      )
    })

    // capture sync results
    const syncResultPromise = new Q((resolve, reject) => {
      nodeSync.on('nodeSyncing', result => {
        global.windows.broadcast(Types.NODE_SYNC_STATUS, 'inProgress', result)
      })

      nodeSync.on('stopped', () => {
        global.windows.broadcast(Types.NODE_SYNC_STATUS, 'stopped')
      })

      nodeSync.on('error', err => {
        log.error('Error syncing node', err)

        reject(err)
      })

      nodeSync.on('finished', () => {
        nodeSync.removeAllListeners('error')
        nodeSync.removeAllListeners('finished')

        resolve()
      })
      nodeSync.on('syncBlock', (results) => {
        this.mwin.webContents.send(Types.SYNC_BLOCK_NUMBER, results.currentBlock, results.highestBlock)
      })
    })

    Q.resolve()
      .then(() => {
        observeManager.stop()
        global.windows.broadcast(Types.FLU_RELAUCH)
        return clientBinaryManager.init(true)
      }).then(() => {
        if (restart) {
          return indexchainNode.restart(settings.nodeType, settings.network, settings.syncmode)
        }
        return indexchainNode.init()
      })
      .then(() => {
        log.info('Indexchain node restarted.')
      })
      .then(function doSync () {
        return syncResultPromise
      })
      .then(function allDone () {
        log.info('all done!')

        // sync data to front-end vuex store
        stateManager.emit('sync')

        observeManager.start()

        global.windows.broadcast(Types.NODE_ALL_DONE)
      })
      .catch(err => {
        log.error('Error starting up node and/or syncing', err)
      })
  }

  create () {
    const selectionMenu = Menu.buildFromTemplate([
      { role: 'copy', label: global.i18n.t('selectionMenu.copy'), accelerator: 'CmdOrCtrl+C' },
      { type: 'separator' },
      { role: 'selectall', label: global.i18n.t('selectionMenu.selectall') }
    ])

    const editSubmenus = [
      { role: 'undo', label: global.i18n.t('inputMenu.undo'), accelerator: 'CmdOrCtrl+Z' },
      { role: 'redo', label: global.i18n.t('inputMenu.redo'), accelerator: 'Shift+CmdOrCtrl+Z' },
      { type: 'separator' },
      { role: 'cut', label: global.i18n.t('inputMenu.cut'), accelerator: 'CmdOrCtrl+X' },
      { role: 'copy', label: global.i18n.t('inputMenu.copy'), accelerator: 'CmdOrCtrl+C' },
      { role: 'paste', label: global.i18n.t('inputMenu.paste'), accelerator: 'CmdOrCtrl+V' },
      { type: 'separator' },
      { role: 'selectall', label: global.i18n.t('inputMenu.selectall') }
    ]
    const inputMenu = Menu.buildFromTemplate(editSubmenus)

    const currentLanguage = global.language

    const languageMenu = Object.keys(global.i18n.options.resources)
      .filter(langCode => langCode !== 'dev')
      .map(langCode => {
        const menuItem = {
          label: global.i18n.t(`appMenu.langCodes.${langCode}`),
          type: 'checkbox',
          checked: langCode === currentLanguage,
          click: () => {
            this.mwin.webContents.send(Types.SWITCH_LAN, langCode)
            global.language = langCode
            global.i18n.changeLanguage(langCode)
            this.create()
          }
        }
        return menuItem
      })
    // let net = ['test', 'main']
    // let netMenue = net.map(net_ => {
    //   return {
    //     label: global.i18n.t(`debugMenu.${net_}`),
    //     type: 'checkbox',
    //     checked: settings.network === net_,
    //     click: () => {
    //       settings.network_ = net_
    //       this.create()
    //       this.kickStart(true)
    //       indexchainNode._loadDefaults()
    //     }
    //   }
    // })
    const debugSubmenus = [
      // {
      //   label: global.i18n.t('debugMenu.net'),
      //   submenu: netMenue
      // },
      // {type: 'separator'},
      {
        label: global.i18n.t('debugMenu.log'),
        click: () => {
          let filename = path.resolve(app.getPath('userData'), 'flu.log')
          fs.writeFileSync(path.resolve(app.getPath('desktop'), 'flu.log'), fs.readFileSync(filename))
          global.windows.broadcast(Types.FLU_LOG_DOWNLOADED)
        }
      },
      {type: 'separator'},
      {
        label: global.i18n.t('debugMenu.rmData'),
        click: () => {
          indexchainNode.stop().then(() => {
            rimraf(settings.chainDataDir, (err) => {
              if (err) {
                log.error('remove chain data encounter an error:', err)
              } else {
                log.info('remove chain data success')
                this.kickStart()
              }
            })
          })
        }
      }
    ]

    const appMenu = [
      {
        label: global.i18n.t('appMenu.edit'),
        submenu: editSubmenus
      },
      {
        label: global.i18n.t('appMenu.view'),
        submenu: [
          {
            label: global.i18n.t('appMenu.language-switch'),
            submenu: languageMenu
          }
        ]
      },
      {
        label: global.i18n.t('appMenu.debug'),
        submenu: debugSubmenus
      }
    ]

    if (process.platform === 'darwin') {
      appMenu.unshift({
        label: app.getName(),
        submenu: [
          {
            role: 'about',
            label: global.i18n.t('appMenu.about') + ' ' + app.getName()
          },

          {type: 'separator'},

          {
            role: 'services',
            label: global.i18n.t('appMenu.services'),
            submenu: []
          },

          {type: 'separator'},

          {
            role: 'hide',
            label: global.i18n.t('appMenu.hide')
          },

          {
            role: 'hideothers',
            label: global.i18n.t('appMenu.hideothers')
          },

          {
            role: 'unhide',
            label: global.i18n.t('appMenu.unhide')
          },

          {type: 'separator'},

          {
            role: 'quit',
            label: global.i18n.t('appMenu.quit') + ' ' + app.getName()
          }

        ]
      })
    } else {
      appMenu.unshift({
        label: global.i18n.t('appMenu.file'),
        submenu: [
          {
            role: 'quit',
            label: global.i18n.t('appMenu.quit') + ' ' + app.getName()
          }
        ]
      })
    }

    var osxMenu = Menu.buildFromTemplate(appMenu)
    Menu.setApplicationMenu(osxMenu)

    this.mwin.webContents.removeAllListeners('context-menu')
    this.mwin.webContents.on('context-menu', (e, props) => {
      const { selectionText, isEditable } = props
      if (isEditable) {
        inputMenu.popup(this.mwin)
      } else if (selectionText && selectionText.trim() !== '') {
        selectionMenu.popup(this.mwin)
      }
    })
  }
}

export default FluMenu
