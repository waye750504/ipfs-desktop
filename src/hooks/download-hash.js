import path from 'path'
import fs from 'fs-extra'
import isIPFS from 'is-ipfs'
import { clipboard, app, dialog, globalShortcut } from 'electron'
import { store, logger } from '../utils'
import { createToggler } from './utils'

const settingsOption = 'downloadHashShortcut'
const shortcut = 'CommandOrControl+Alt+D'

function validateIPFS (text) {
  return isIPFS.multihash(text) ||
    isIPFS.cid(text) ||
    isIPFS.ipfsPath(text) ||
    isIPFS.ipfsPath(`/ipfs/${text}`)
}

function selectDirectory () {
  return new Promise(resolve => {
    dialog.showOpenDialog({
      title: 'Select a directory',
      defaultPath: app.getPath('downloads'),
      properties: [
        'openDirectory',
        'createDirectory'
      ]
    }, (res) => {
      if (!res || res.length === 0) {
        resolve()
      } else {
        resolve(res[0])
      }
    })
  })
}

async function saveFile (dir, file) {
  const location = path.join(dir, file.path)

  if (await fs.pathExists(location)) {
    // ignore the hash itself
    return
  }

  try {
    await fs.writeFile(location, file.content)
    logger.info(`File '${file.path}' downloaded to ${location}.`)
  } catch (e) {
    logger.error(e.stack)
  }
}

function handler (ctx) {
  const { ipfsd } = ctx

  return async () => {
    const text = clipboard.readText().trim()
    const ipfs = ipfsd.api

    if (!ipfs || !text) {
      return
    }

    if (!validateIPFS(text)) {
      dialog.showErrorBox(
        'Invalid Hash',
        'The hash you provided is invalid.'
      )
      return
    }

    try {
      const files = await ipfs.get(text)
      logger.info(`Hash ${text} downloaded.`)

      const dir = await selectDirectory(ctx)

      if (!dir) {
        logger.info(`Dropping hash ${text}: user didn't choose a path.`)
        return
      }

      if (files.length > 1) {
        fs.mkdirSync(path.join(dir, text))
      }

      files.forEach(file => { saveFile(dir, file) })
    } catch (e) {
      logger.error(e.stack)
      dialog.showErrorBox(
        'Error while downloading',
        'Some error happened while getting the hash. Please check the logs.'
      )
    }
  }
}

export default function (ctx) {
  let activate = (value, oldValue) => {
    if (value === oldValue) return

    if (value === true) {
      globalShortcut.register(shortcut, handler(ctx))
      logger.info('Hash download shortcut enabled')
    } else {
      globalShortcut.unregister(shortcut)
      logger.info('Hash download shortcut disabled')
    }
  }

  activate(store.get(settingsOption, false))
  createToggler(ctx, settingsOption, activate)
}
