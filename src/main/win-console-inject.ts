import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * Per-clip console injection via PostMessage into CS2.
 *
 * Uses the `/~ key (VK_OEM_3, 0xC0) to toggle the developer console.
 * bind "`" "toggleconsole" is set in the launch CFG so this always works.
 *
 * Each clip's seek sequence is sent as a single PowerShell call that:
 * 1. Finds the CS2 window via EnumWindows
 * 2. Brings CS2 to foreground (needed for SendInput to work with SendKey)
 * 3. Opens the developer console via PostMessage VK_OEM_3
 * 4. Types each command via WM_CHAR, presses Enter, sleeps for per-command delay
 * 5. Closes the console (hideconsole)
 *
 * PostMessage(WM_CHAR) bypasses Windows UIPI restrictions.
 * Delays happen inside PowerShell so Node.js is not blocked.
 * Steps are passed as base64-encoded JSON to avoid shell escaping.
 */

const PS_SCRIPT = `
$ErrorActionPreference = "Stop"
$json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($args[0]))
$steps = ConvertFrom-Json $json

$csharp = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class CS2Inject {
    const uint WM_KEYDOWN = 0x0100, WM_KEYUP = 0x0101, WM_CHAR = 0x0102;
    const int VK_RETURN = 0x0D, VK_OEM3 = 0xC0;
    const int SCAN_ENTER = 0x1C, SCAN_OEM3 = 0x29;
    const uint SW_RESTORE = 0x09;

    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
    [DllImport("user32.dll")]
    static extern int GetWindowTextLength(IntPtr hwnd);
    [DllImport("user32.dll")]
    static extern int GetWindowText(IntPtr hwnd, StringBuilder sb, int max);
    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")]
    static extern IntPtr PostMessage(IntPtr hWnd, uint Msg, int wParam, int lParam);
    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    static extern bool ShowWindow(IntPtr hWnd, uint nCmdShow);
    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("kernel32.dll")]
    static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")]
    static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    static IntPtr _hwnd = IntPtr.Zero;

    static bool EnumProc(IntPtr hwnd, IntPtr lParam) {
        if (!IsWindowVisible(hwnd)) return true;
        int len = GetWindowTextLength(hwnd);
        if (len == 0) return true;
        StringBuilder sb = new StringBuilder(len + 1);
        GetWindowText(hwnd, sb, sb.Capacity);
        string t = sb.ToString();
        if (t.Contains("Counter-Strike") && !t.ToLower().Contains("obs")) {
            _hwnd = hwnd;
            return false;
        }
        return true;
    }

    public static IntPtr FindWindow() {
        _hwnd = IntPtr.Zero;
        EnumWindows(EnumProc, IntPtr.Zero);
        return _hwnd;
    }

    public static bool FocusWindow(IntPtr hwnd) {
        ShowWindow(hwnd, SW_RESTORE);
        uint currentThread = GetCurrentThreadId();
        uint foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out _);
        bool attached = false;
        if (currentThread != foregroundThread) {
            attached = AttachThreadInput(currentThread, foregroundThread, true);
        }
        bool result = SetForegroundWindow(hwnd);
        if (attached) {
            AttachThreadInput(currentThread, foregroundThread, false);
        }
        return result;
    }

    public static void SendKey(int vk, int scan) {
        int down = (scan << 16) | 1;
        int up = (1 << 31) | (1 << 30) | (scan << 16) | 1;
        PostMessage(_hwnd, WM_KEYDOWN, vk, down);
        System.Threading.Thread.Sleep(60);
        PostMessage(_hwnd, WM_KEYUP, vk, up);
    }

    public static void TypeLine(string text) {
        foreach (char c in text) {
            PostMessage(_hwnd, WM_CHAR, (int)c, 1);
            System.Threading.Thread.Sleep(3);
        }
        System.Threading.Thread.Sleep(30);
        int down = (SCAN_ENTER << 16) | 1;
        int up = (1 << 31) | (1 << 30) | (SCAN_ENTER << 16) | 1;
        PostMessage(_hwnd, WM_KEYDOWN, VK_RETURN, down);
        System.Threading.Thread.Sleep(50);
        PostMessage(_hwnd, WM_KEYUP, VK_RETURN, up);
    }
}
'@

Add-Type -TypeDefinition $csharp
$hwnd = [CS2Inject]::FindWindow()
if ($hwnd -eq [IntPtr]::Zero) {
    Write-Output "WINDOW_NOT_FOUND"
    exit 1
}

# Focus CS2 window before sending keys
[CS2Inject]::FocusWindow($hwnd)
Start-Sleep -Milliseconds 200

# Open console via tilde/backtick key (VK_OEM3)
[CS2Inject]::SendKey(0xC0, 0x29)
Start-Sleep -Milliseconds 250

# Loop through steps - PowerShell handles delays, C# handles PostMessage
foreach ($step in $steps) {
    [CS2Inject]::TypeLine($step.cmd)
    $delay = [int]$step.delay
    if ($delay -gt 0) { Start-Sleep -Milliseconds $delay }
}

# Close console
[CS2Inject]::TypeLine("hideconsole")
Start-Sleep -Milliseconds 80
Write-Output "OK"
`

const PS_SIMPLE_SCRIPT = `
$ErrorActionPreference = "Stop"
$cmd = [string]$args[0]
$csharp = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CS2Simple {
    const uint WM_KEYDOWN = 0x0100, WM_KEYUP = 0x0101, WM_CHAR = 0x0102;
    const int VK_RETURN = 0x0D, VK_OEM3 = 0xC0;
    const int SCAN_ENTER = 0x1C, SCAN_OEM3 = 0x29;
    const uint SW_RESTORE = 0x09;
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc e, IntPtr l);
    delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int m);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr PostMessage(IntPtr h, uint M, int w, int l);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, uint n);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool f);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    static IntPtr _h;
    static bool P(IntPtr h, IntPtr l) {
        if (!IsWindowVisible(h)) return true;
        int n = GetWindowTextLength(h); if (n==0) return true;
        StringBuilder s = new StringBuilder(n+1); GetWindowText(h,s,s.Capacity);
        if (s.ToString().Contains("Counter-Strike")){_h=h;return false;} return true;
    }
    static void Focus(IntPtr h) {
        ShowWindow(h, SW_RESTORE);
        uint ct = GetCurrentThreadId();
        uint ft = GetWindowThreadProcessId(GetForegroundWindow(), out _);
        bool a = false;
        if (ct != ft) a = AttachThreadInput(ct, ft, true);
        SetForegroundWindow(h);
        if (a) AttachThreadInput(ct, ft, false);
    }
    public static bool Send(string cmd) {
        _h=IntPtr.Zero; EnumWindows(P,IntPtr.Zero); if(_h==IntPtr.Zero) return false;
        Focus(_h);
        System.Threading.Thread.Sleep(200);
        int dd=(SCAN_OEM3<<16)|1, du=(1<<31)|(1<<30)|(SCAN_OEM3<<16)|1;
        PostMessage(_h,WM_KEYDOWN,VK_OEM3,dd); System.Threading.Thread.Sleep(60);
        PostMessage(_h,WM_KEYUP,VK_OEM3,du); System.Threading.Thread.Sleep(250);
        foreach(char c in cmd){PostMessage(_h,WM_CHAR,(int)c,1);System.Threading.Thread.Sleep(3);}
        System.Threading.Thread.Sleep(30);
        int ed=(SCAN_ENTER<<16)|1, eu=(1<<31)|(1<<30)|(SCAN_ENTER<<16)|1;
        PostMessage(_h,WM_KEYDOWN,VK_RETURN,ed); System.Threading.Thread.Sleep(50);
        PostMessage(_h,WM_KEYUP,VK_RETURN,eu); System.Threading.Thread.Sleep(100);
        foreach(char c in "hideconsole"){PostMessage(_h,WM_CHAR,(int)c,1);System.Threading.Thread.Sleep(3);}
        PostMessage(_h,WM_KEYDOWN,VK_RETURN,ed); System.Threading.Thread.Sleep(50);
        PostMessage(_h,WM_KEYUP,VK_RETURN,eu);
        return true;
    }
}
'@
Add-Type -TypeDefinition $csharp
$ok = [CS2Simple]::Send($cmd)
if ($ok) { Write-Output "OK" } else { Write-Output "WINDOW_NOT_FOUND" }
`

export interface CommandStep {
  cmd: string
  delay: number // ms to wait AFTER this command executes
}

let mainScriptPath: string | null = null
let simpleScriptPath: string | null = null

function ensureScripts(): { main: string; simple: string } {
  if (!mainScriptPath || !fs.existsSync(mainScriptPath)) {
    mainScriptPath = path.join(os.tmpdir(), 'cs2fragforge_inject.ps1')
    fs.writeFileSync(mainScriptPath, PS_SCRIPT, 'utf-8')
  }
  if (!simpleScriptPath || !fs.existsSync(simpleScriptPath)) {
    simpleScriptPath = path.join(os.tmpdir(), 'cs2fragforge_simple.ps1')
    fs.writeFileSync(simpleScriptPath, PS_SIMPLE_SCRIPT, 'utf-8')
  }
  return { main: mainScriptPath, simple: simpleScriptPath }
}

function execPowershell(args: string, timeoutMs: number = 30_000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    exec(args, {
      timeout: timeoutMs,
      windowsHide: true,
      encoding: 'utf-8'
    }, (error, stdout, stderr) => {
      if (error && error.killed) {
        reject(new Error('PowerShell timed out'))
      } else if (error) {
        reject(error)
      } else {
        resolve((stdout || '').trim())
      }
    })
  })
}

/**
 * Inject a timed command sequence into CS2.
 *
 * One PowerShell call per sequence. Opens console via ` (VK_OEM3),
 * types each command with per-step delay, closes with hideconsole.
 *
 * Typical per-clip (Insight Agent pattern):
 *   { cmd: 'demo_pause',         delay: 100  },
 *   { cmd: 'demo_timescale 1',   delay: 100  },
 *   { cmd: 'demo_gototick 5000', delay: 3500 },
 *   { cmd: 'demo_resume',        delay: 500  },
 *
 * Delays happen inside PowerShell (non-blocking to Node).
 */
export async function injectTimedSequence(steps: CommandStep[], retries: number = 2): Promise<boolean> {
  const scripts = ensureScripts()
  const json = JSON.stringify(steps)
  const b64 = Buffer.from(json, 'utf-8').toString('base64')

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      console.log(`[Inject] Retry attempt ${attempt}/${retries}...`)
      await new Promise(r => setTimeout(r, 1000))
    }
    try {
      const result = await execPowershell(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${scripts.main}" "${b64}"`,
        60_000
      )
      if (result === 'OK') return true
      if (result === 'WINDOW_NOT_FOUND') {
        console.warn(`[Inject] CS2 window not found (attempt ${attempt + 1})`)
      }
    } catch (err) {
      console.warn(`[Inject] timed sequence failed (attempt ${attempt + 1}):`, err)
    }
  }
  return false
}

/** Inject a single console command (legacy helper). */
export async function injectSingleCommand(cmd: string): Promise<boolean> {
  try {
    const scripts = ensureScripts()
    const result = await execPowershell(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scripts.simple}" "${cmd.replace(/"/g, '`"')}"`,
      15_000
    )
    if (result === 'OK') return true
    if (result === 'WINDOW_NOT_FOUND') console.warn('[Inject] CS2 window not found for:', cmd)
    return false
  } catch (err) {
    console.warn('[Inject] single command failed:', err)
    return false
  }
}

export function cleanupInjectScript(): void {
  for (const p of [mainScriptPath, simpleScriptPath]) {
    if (p) { try { fs.unlinkSync(p) } catch { /* ignore */ } }
  }
  mainScriptPath = null
  simpleScriptPath = null
}
