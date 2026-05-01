import fs from 'fs'
import path from 'path'

/**
 * Steam Registry Service
 * Reads Steam installation information from the Windows Registry.
 */
export class SteamRegistry {
  private static readonly STEAM_KEY = 'HKCU\\Software\\Valve\\Steam'
  private static readonly STEAM_KEY_HKLM = 'HKLM\\Software\\Valve\\Steam'

  private static readRegistryValue(key: string, valueName: string): string | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { execSync } = require('child_process') as typeof import('child_process')
      const output = execSync(`reg query "${key}" /v "${valueName}"`, {
        encoding: 'utf-8',
        windowsHide: true
      })
      const lines = output.trim().split('\n')
      for (const line of lines) {
        const match = line.match(/REG_SZ\s+(.+)$/i)
        if (match) {
          return match[1].trim()
        }
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Find the Steam installation directory.
   * Checks HKCU first, then HKLM, then common default locations.
   */
  static getSteamPath(): string | null {
    const hkcuPath = this.readRegistryValue(this.STEAM_KEY, 'SteamPath')
    if (hkcuPath && fs.existsSync(hkcuPath)) {
      return hkcuPath
    }

    const hklmPath = this.readRegistryValue(this.STEAM_KEY_HKLM, 'InstallPath')
    if (hklmPath && fs.existsSync(hklmPath)) {
      return hklmPath
    }

    const commonPaths = [
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam',
      'D:\\Steam',
      'D:\\Program Files (x86)\\Steam'
    ]

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        return p
      }
    }

    return null
  }

  /**
   * Get the Steam library folders (for finding games on different drives).
   * Reads from libraryfolders.vdf in the Steam install directory.
   */
  static getLibraryFolders(steamPath: string): string[] {
    const folders = [steamPath]

    const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf')
    if (!fs.existsSync(vdfPath)) {
      return folders
    }

    try {
      const content = fs.readFileSync(vdfPath, 'utf-8')
      const pathRegex = /"path"\s+"([^"]+)"/g
      let match: RegExpExecArray | null
      while ((match = pathRegex.exec(content)) !== null) {
        const libPath = match[1].replace(/\\\\/g, '\\')
        if (libPath !== steamPath && fs.existsSync(libPath)) {
          folders.push(libPath)
        }
      }
    } catch {
      // VDF parsing failed, return default
    }

    return folders
  }
}

/**
 * CS2 Path Resolver
 * Finds the Counter-Strike 2 installation directory and related paths.
 */
export class CS2PathResolver {
  private static readonly CS2_DIR_NAME = 'Counter-Strike Global Offensive'
  private static readonly CS2_SUBDIRS = ['steamapps', 'common']
  private static readonly CS2_EXE_SUBPATH = ['game', 'bin', 'win64', 'cs2.exe']
  private static readonly REPLAYS_SUBPATH = ['game', 'csgo', 'replays']
  private static readonly CSGO_SUBPATH = ['game', 'csgo']
  private static readonly CONSOLE_LOG_SUBPATH = ['game', 'csgo', 'console.log']

  /**
   * Find the CS2 installation directory by searching all Steam library folders.
   */
  static findCS2Path(): string | null {
    const steamPath = SteamRegistry.getSteamPath()
    if (!steamPath) {
      return null
    }

    const libraries = SteamRegistry.getLibraryFolders(steamPath)

    for (const libPath of libraries) {
      const cs2Path = path.join(libPath, ...this.CS2_SUBDIRS, this.CS2_DIR_NAME)
      const cs2ExePath = path.join(cs2Path, ...this.CS2_EXE_SUBPATH)
      if (fs.existsSync(cs2ExePath)) {
        return cs2Path
      }
    }

    return null
  }

  /**
   * Validate a manually-specified CS2 path.
   */
  static validateCS2Path(cs2Path: string): boolean {
    const cs2ExePath = path.join(cs2Path, ...this.CS2_EXE_SUBPATH)
    return fs.existsSync(cs2ExePath)
  }

  static getCS2ExePath(cs2Path: string): string {
    return path.join(cs2Path, ...this.CS2_EXE_SUBPATH)
  }

  static getReplaysPath(cs2Path: string): string {
    const replaysPath = path.join(cs2Path, ...this.REPLAYS_SUBPATH)
    if (!fs.existsSync(replaysPath)) {
      fs.mkdirSync(replaysPath, { recursive: true })
    }
    return replaysPath
  }

  static getCsgoPath(cs2Path: string): string {
    const csgoPath = path.join(cs2Path, ...this.CSGO_SUBPATH)
    if (!fs.existsSync(csgoPath)) {
      fs.mkdirSync(csgoPath, { recursive: true })
    }
    return csgoPath
  }

  static getConsoleLogPath(cs2Path: string): string {
    return path.join(cs2Path, ...this.CONSOLE_LOG_SUBPATH)
  }

  static getSteamUserId(steamPath: string): string | null {
    const userdataPath = path.join(steamPath, 'userdata')
    if (!fs.existsSync(userdataPath)) {
      return null
    }

    try {
      const dirs = fs.readdirSync(userdataPath)
      const userIds = dirs.filter((d) => /^\d+$/.test(d))
      if (userIds.length === 0) return null

      let latestDir = userIds[0]
      let latestTime = 0
      for (const dir of userIds) {
        const stat = fs.statSync(path.join(userdataPath, dir))
        if (stat.mtimeMs > latestTime) {
          latestTime = stat.mtimeMs
          latestDir = dir
        }
      }
      return latestDir
    } catch {
      return null
    }
  }

  static getEnvironmentInfo(): {
    steamPath: string | null
    cs2Path: string | null
    cs2ExePath: string | null
    replaysPath: string | null
    steamUserId: string | null
  } {
    const steamPath = SteamRegistry.getSteamPath()

    if (!steamPath) {
      return { steamPath: null, cs2Path: null, cs2ExePath: null, replaysPath: null, steamUserId: null }
    }

    const cs2Path = this.findCS2Path()

    if (!cs2Path) {
      return {
        steamPath,
        cs2Path: null,
        cs2ExePath: null,
        replaysPath: null,
        steamUserId: this.getSteamUserId(steamPath)
      }
    }

    return {
      steamPath,
      cs2Path,
      cs2ExePath: this.getCS2ExePath(cs2Path),
      replaysPath: this.getReplaysPath(cs2Path),
      steamUserId: this.getSteamUserId(steamPath)
    }
  }
}