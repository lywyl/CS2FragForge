/**
 * CS2 用户配置快照 / 恢复 — Insight Agent cs2_config_backup.py 的 Node.js 移植。
 *
 * 录制期间 CS2 会把被修改的 archive cvar（fps_max, hud_showtargetid,
 * viewmodel_fov, snd_voipvolume 等）定期持久化到磁盘。taskkill /F 只能阻止
 * 此后的写入，已经落盘的脏值会在用户下次启动 CS2 时被读回，导致玩家键位/画面
 * 设置被覆盖。
 *
 * 方案：发射 CS2 前对目标文件做字节级快照；录制结束后若文件内容发生变化，
 * 从快照直接恢复。
 */

import fs from 'fs'
import path from 'path'

// ── 需要保护的文件名 ──────────────────────────────────────────────
const WATCHED_FILENAMES = new Set([
  'config.cfg',
  'cs2_user.cfg',
  'cs2_machine_convars.vcfg',
  'video.txt',
  'cs2_video.txt',
  'user_convars_0_slot0.vcfg',
  'cs2_user_convars_0_slot0.vcfg',
])

// 通配模式（按前缀匹配）
const WATCHED_GLOBS = [
  'user_convars_0_slot',
  'cs2_user_convars_0_slot',
  'cs2_user_keys',
]

interface SnapshotEntry {
  absPath: string
  existed: boolean
  data: Buffer | null // null = file didn't exist before recording
}

let snapshot: Map<string, SnapshotEntry> | null = null

// ── 扫描候选目录 ──────────────────────────────────────────────────
function candidateConfigDirs(cs2Path: string): string[] {
  const dirs: string[] = []

  // 1) <cs2>/game/csgo/cfg — 老版本 config.cfg
  const csgoCfg = path.join(cs2Path, 'game', 'csgo', 'cfg')
  if (fs.existsSync(csgoCfg)) dirs.push(csgoCfg)

  // 2) <cs2>/../../Steam/userdata/<id>/730/local/cfg — CS2 archive cvar 主目录
  // cs2.exe 在 game/bin/win64/ 下，往上 6 层到 Steam 根目录
  try {
    const steamRoot = path.resolve(cs2Path, '..', '..', '..', '..', '..', '..')
    const userdataDir = path.join(steamRoot, 'userdata')
    if (fs.existsSync(userdataDir)) {
      const entries = fs.readdirSync(userdataDir)
      for (const entry of entries) {
        const cfgDir = path.join(userdataDir, entry, '730', 'local', 'cfg')
        if (/^\d+$/.test(entry) && fs.existsSync(cfgDir)) {
          dirs.push(cfgDir)
        }
      }
    }
  } catch {
    // Steam root not reachable, skip
  }

  return dirs
}

function isWatched(filename: string): boolean {
  if (WATCHED_FILENAMES.has(filename)) return true
  for (const prefix of WATCHED_GLOBS) {
    if (filename.startsWith(prefix)) return true
  }
  return false
}

// ── 快照 ───────────────────────────────────────────────────────────
export function snapshotUserConfigs(cs2Path: string): Map<string, SnapshotEntry> {
  const snap = new Map<string, SnapshotEntry>()
  const dirs = candidateConfigDirs(cs2Path)

  for (const dir of dirs) {
    let entries: string[]
    try {
      entries = fs.readdirSync(dir)
    } catch {
      continue
    }

    for (const filename of entries) {
      if (!isWatched(filename)) continue
      const absPath = path.join(dir, filename)
      try {
        const data = fs.readFileSync(absPath)
        snap.set(absPath, { absPath, existed: true, data })
      } catch {
        snap.set(absPath, { absPath, existed: false, data: null })
      }
    }
  }

  snapshot = snap
  console.log(`[ConfigBackup] Snapshot: ${snap.size} files across ${dirs.length} directories`)
  return snap
}

// ── 恢复 ───────────────────────────────────────────────────────────
export function restoreUserConfigs(): number {
  if (!snapshot || snapshot.size === 0) return 0

  let restored = 0
  for (const [absPath, entry] of snapshot) {
    try {
      if (entry.existed && entry.data) {
        // 文件原来存在 → 检查是否被修改，若修改则恢复
        let current: Buffer | null = null
        try {
          current = fs.readFileSync(absPath)
        } catch {
          // file deleted, will restore
        }
        if (!current || !current.equals(entry.data)) {
          fs.writeFileSync(absPath, entry.data)
          restored++
        }
      } else {
        // 文件原来不存在但被创建了 → 删除
        if (fs.existsSync(absPath)) {
          fs.unlinkSync(absPath)
          restored++
        }
      }
    } catch (err) {
      console.warn(`[ConfigBackup] Restore failed for ${absPath}:`, (err as Error).message)
    }
  }

  if (restored > 0) {
    console.log(`[ConfigBackup] Restored ${restored} config files`)
  }
  snapshot = null
  return restored
}

/**
 * 检查当前是否有快照（用于判断是否需要恢复）。
 */
export function hasSnapshot(): boolean {
  return snapshot !== null && snapshot.size > 0
}
