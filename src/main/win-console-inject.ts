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
    const int VK_RETURN = 0x0D, VK_OEM3 = 0xC0, VK_MENU = 0x12;
    const int SCAN_ENTER = 0x1C, SCAN_OEM3 = 0x29;
    const uint SW_RESTORE = 0x09, SW_SHOW = 5;
    const int INPUT_KEYBOARD = 1, KEYEVENTF_KEYUP = 0x0002;
    const int HWND_TOPMOST = -1, HWND_NOTOPMOST = -2;
    const int SWP_NOMOVE = 0x0001, SWP_NOSIZE = 0x0002, SWP_NOACTIVATE = 0x0010, SWP_SHOWWINDOW = 0x0040;

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
    static extern bool ShowWindowAsync(IntPtr hWnd, uint nCmdShow);
    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("kernel32.dll")]
    static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")]
    static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    [DllImport("user32.dll")]
    static extern bool AllowSetForegroundWindow(uint dwProcessId);
    [DllImport("user32.dll")]
    static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")]
    static extern IntPtr SetFocus(IntPtr hWnd);
    [DllImport("user32.dll")]
    static extern bool SetWindowPos(IntPtr hWnd, int hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Explicit)]
    struct INPUT_UNION {
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct INPUT {
        public uint type;
        public INPUT_UNION u;
    }

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

    static bool SendInputKey(ushort vk, bool keyUp) {
        var input = new INPUT();
        input.type = INPUT_KEYBOARD;
        input.u.ki.wVk = vk;
        input.u.ki.wScan = 0;
        input.u.ki.dwFlags = keyUp ? (uint)KEYEVENTF_KEYUP : 0;
        input.u.ki.time = 0;
        input.u.ki.dwExtraInfo = IntPtr.Zero;
        return SendInput(1, new[] { input }, Marshal.SizeOf(typeof(INPUT))) == 1;
    }

    // Insight Agent pattern: SendInput first, fallback to PostMessage
    public static void VkTapWithFallback(int vk, int scan) {
        bool sent = false;
        if (GetForegroundWindow() == _hwnd) {
            sent = SendInputKey((ushort)vk, false);
            if (sent) {
                System.Threading.Thread.Sleep(40);
                sent = SendInputKey((ushort)vk, true);
            }
        }
        if (!sent) {
            int down = (scan << 16) | 1;
            int up = (1 << 31) | (1 << 30) | (scan << 16) | 1;
            PostMessage(_hwnd, WM_KEYDOWN, vk, down);
            System.Threading.Thread.Sleep(40);
            PostMessage(_hwnd, WM_KEYUP, vk, up);
        }
    }

    public static bool FocusWindow(IntPtr hwnd) {
        ShowWindowAsync(hwnd, SW_SHOW);
        ShowWindow(hwnd, SW_RESTORE);
        // Topmost pulse to ensure visibility
        SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
        SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
        // Alt tap to release foreground lock (Insight Agent trick)
        SendInputKey(VK_MENU, false);
        System.Threading.Thread.Sleep(30);
        SendInputKey(VK_MENU, true);
        System.Threading.Thread.Sleep(30);

        uint currentThread = GetCurrentThreadId();
        IntPtr fgWnd = GetForegroundWindow();
        uint dummy1 = 0, dummy2 = 0;
        uint fgThread = GetWindowThreadProcessId(fgWnd, out dummy1);
        uint targetThread = GetWindowThreadProcessId(hwnd, out dummy2);
        bool attachedFg = false, attachedTarget = false;
        if (fgThread != 0 && fgThread != currentThread)
            attachedFg = AttachThreadInput(currentThread, fgThread, true);
        if (targetThread != 0 && targetThread != currentThread && targetThread != fgThread)
            attachedTarget = AttachThreadInput(currentThread, targetThread, true);
        try {
            AllowSetForegroundWindow(0xFFFFFFFF);
            SwitchToThisWindow(hwnd, true);
            SetForegroundWindow(hwnd);
            BringWindowToTop(hwnd);
            SetFocus(hwnd);
        } finally {
            if (attachedTarget) AttachThreadInput(currentThread, targetThread, false);
            if (attachedFg) AttachThreadInput(currentThread, fgThread, false);
        }
        // Poll until CS2 is actually foreground
        for (int i = 0; i < 30; i++) {
            if (GetForegroundWindow() == hwnd) return true;
            System.Threading.Thread.Sleep(20);
        }
        return GetForegroundWindow() == hwnd;
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

# Write C# source as UTF-8 (Add-Type uses system codepage which corrupts CJK chars)
$csPath = Join-Path $env:TEMP "cs2fragforge_inject.cs"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($csPath, $csharp, $utf8NoBom)

# Find csc.exe (.NET Framework 4.x)
$netDir = Join-Path $env:SystemRoot "Microsoft.NET\Framework64\v4.0.30319"
if (!(Test-Path $netDir)) { $netDir = Join-Path $env:SystemRoot "Microsoft.NET\Framework\v4.0.30319" }
$csc = Join-Path $netDir "csc.exe"
$dllPath = Join-Path $env:TEMP "cs2fragforge_inject.dll"

& $csc /nologo /target:library /out:$dllPath /utf8output $csPath 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Output "COMPILE_FAILED"
    exit 1
}
Add-Type -Path $dllPath
Remove-Item $csPath, $dllPath -ErrorAction SilentlyContinue

$hwnd = [CS2Inject]::FindWindow()
if ($hwnd -eq [IntPtr]::Zero) {
    Write-Output "WINDOW_NOT_FOUND"
    exit 1
}

# Focus CS2 window (with Alt-tap foreground unlock)
$focused = [CS2Inject]::FocusWindow($hwnd)
if (!$focused) {
    Write-Output "FOCUS_FAILED"
    exit 1
}
Start-Sleep -Milliseconds 120

# Verify foreground
$fgCheck = [CS2Inject]::FindWindow()

# Open console via tilde key (VK_OEM3, 0xC0) using SendInput-first pattern
[CS2Inject]::VkTapWithFallback(0xC0, 0x29)
Start-Sleep -Milliseconds 180

# Loop through steps — delays happen inside PowerShell, non-blocking to Node
foreach ($step in $steps) {
    [CS2Inject]::TypeLine($step.cmd)
    $delay = [int]$step.delay
    if ($delay -gt 0) { Start-Sleep -Milliseconds $delay }
}

# Close console via hideconsole command (works regardless of keyboard layout)
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
    const int VK_RETURN = 0x0D, VK_OEM3 = 0xC0, VK_MENU = 0x12;
    const int SCAN_ENTER = 0x1C, SCAN_OEM3 = 0x29;
    const uint SW_RESTORE = 0x09, SW_SHOW = 5;
    const int INPUT_KEYBOARD = 1, KEYEVENTF_KEYUP = 0x0002;
    const int HWND_TOPMOST = -1, HWND_NOTOPMOST = -2;
    const int SWP_NOMOVE=0x0001, SWP_NOSIZE=0x0002, SWP_NOACTIVATE=0x0010, SWP_SHOWWINDOW=0x0040;
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc e, IntPtr l);
    delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int m);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr PostMessage(IntPtr h, uint M, int w, int l);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, uint n);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr h, uint n);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool f);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] p, int cb);
    [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(uint p);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr h);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, int a, int x, int y, int cx, int cy, uint f);
    [DllImport("user32.dll")] static extern void SwitchToThisWindow(IntPtr h, bool f);
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk,wScan; public uint dwFlags,time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct INPUT_UNION { [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUT_UNION u; }
    static IntPtr _h;
    static bool P(IntPtr h, IntPtr l) {
        if (!IsWindowVisible(h)) return true;
        int n = GetWindowTextLength(h); if (n==0) return true;
        StringBuilder s = new StringBuilder(n+1); GetWindowText(h,s,s.Capacity);
        if (s.ToString().Contains("Counter-Strike")){_h=h;return false;} return true;
    }
    static bool SIKey(ushort vk, bool up) {
        var i = new INPUT(); i.type = INPUT_KEYBOARD; i.u.ki.wVk = vk; i.u.ki.dwFlags = up?(uint)KEYEVENTF_KEYUP:0;
        return SendInput(1, new[]{i}, Marshal.SizeOf(typeof(INPUT)))==1;
    }
    static void VkTap(int vk, int scan) {
        bool s = false;
        if (GetForegroundWindow()==_h) { s=SIKey((ushort)vk,false); if(s){System.Threading.Thread.Sleep(40);s=SIKey((ushort)vk,true);} }
        if (!s) { int d=(scan<<16)|1, u=(1<<31)|(1<<30)|(scan<<16)|1; PostMessage(_h,WM_KEYDOWN,vk,d); System.Threading.Thread.Sleep(40); PostMessage(_h,WM_KEYUP,vk,u); }
    }
    static bool Focus(IntPtr h) {
        ShowWindowAsync(h,SW_SHOW); ShowWindow(h,SW_RESTORE);
        SetWindowPos(h,HWND_TOPMOST,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE|SWP_SHOWWINDOW);
        SetWindowPos(h,HWND_NOTOPMOST,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE|SWP_SHOWWINDOW);
        SIKey(VK_MENU,false); System.Threading.Thread.Sleep(30); SIKey(VK_MENU,true); System.Threading.Thread.Sleep(30);
        uint d1=0,d2=0; uint ct=GetCurrentThreadId(), ft=GetWindowThreadProcessId(GetForegroundWindow(),out d1), tt=GetWindowThreadProcessId(h,out d2);
        bool af=false,at=false;
        if(ft!=0&&ft!=ct)af=AttachThreadInput(ct,ft,true);
        if(tt!=0&&tt!=ct&&tt!=ft)at=AttachThreadInput(ct,tt,true);
        try{AllowSetForegroundWindow(0xFFFFFFFF);SwitchToThisWindow(h,true);SetForegroundWindow(h);BringWindowToTop(h);SetFocus(h);}
        finally{if(at)AttachThreadInput(ct,tt,false);if(af)AttachThreadInput(ct,ft,false);}
        for(int i=0;i<30;i++){if(GetForegroundWindow()==h)return true;System.Threading.Thread.Sleep(20);}
        return GetForegroundWindow()==h;
    }
    public static bool Send(string cmd) {
        _h=IntPtr.Zero; EnumWindows(P,IntPtr.Zero); if(_h==IntPtr.Zero) return false;
        if(!Focus(_h)) return false;
        System.Threading.Thread.Sleep(120);
        VkTap(VK_OEM3,SCAN_OEM3);
        System.Threading.Thread.Sleep(180);
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
# Write C# source as UTF-8
$csPath = Join-Path $env:TEMP "cs2fragforge_simple.cs"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($csPath, $csharp, $utf8NoBom)
$netDir = Join-Path $env:SystemRoot "Microsoft.NET\Framework64\v4.0.30319"
if (!(Test-Path $netDir)) { $netDir = Join-Path $env:SystemRoot "Microsoft.NET\Framework\v4.0.30319" }
$csc = Join-Path $netDir "csc.exe"
$dllPath = Join-Path $env:TEMP "cs2fragforge_simple.dll"
& $csc /nologo /target:library /out:$dllPath /utf8output $csPath 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Output "COMPILE_FAILED"; exit 1 }
Add-Type -Path $dllPath
Remove-Item $csPath, $dllPath -ErrorAction SilentlyContinue
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
      await new Promise(r => setTimeout(r, 1500))
    }
    try {
      const result = await execPowershell(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${scripts.main}" "${b64}"`,
        60_000
      )
      if (result === 'OK') return true
      if (result === 'WINDOW_NOT_FOUND') {
        console.warn(`[Inject] CS2 window not found (attempt ${attempt + 1})`)
      } else if (result === 'FOCUS_FAILED') {
        console.warn(`[Inject] CS2 window focus failed (attempt ${attempt + 1})`)
      } else if (result === 'COMPILE_FAILED') {
        console.error(`[Inject] C# compilation failed (attempt ${attempt + 1})`)
        return false // no point retrying compilation
      } else {
        console.warn(`[Inject] unexpected result: "${result}" (attempt ${attempt + 1})`)
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
    else if (result === 'COMPILE_FAILED') console.error('[Inject] C# compilation failed for:', cmd)
    return false
  } catch (err) {
    console.warn('[Inject] single command failed:', err)
    return false
  }
}

export function cleanupInjectScript(): void {
  for (const p of [mainScriptPath, simpleScriptPath, findScriptPath]) {
    if (p) { try { fs.unlinkSync(p) } catch { /* ignore */ } }
  }
  mainScriptPath = null
  simpleScriptPath = null
  findScriptPath = null
}

const PS_FIND_SCRIPT = `
$csharp = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CS2Find {
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc e, IntPtr l);
    delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int m);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    static IntPtr _h;
    static bool P(IntPtr h, IntPtr l) {
        if (!IsWindowVisible(h)) return true;
        int n = GetWindowTextLength(h); if (n==0) return true;
        StringBuilder s = new StringBuilder(n+1); GetWindowText(h,s,s.Capacity);
        if (s.ToString().Contains("Counter-Strike") && !s.ToString().ToLower().Contains("obs")) { _h=h; return false; }
        return true;
    }
    public static bool Find() { _h=IntPtr.Zero; EnumWindows(P,IntPtr.Zero); return _h!=IntPtr.Zero; }
}
'@
Add-Type -TypeDefinition $csharp
if ([CS2Find]::Find()) { Write-Output "FOUND" } else { Write-Output "NOT_FOUND" }
`

let findScriptPath: string | null = null

function ensureFindScript(): string {
  if (!findScriptPath || !fs.existsSync(findScriptPath)) {
    findScriptPath = path.join(os.tmpdir(), 'cs2fragforge_find.ps1')
    fs.writeFileSync(findScriptPath, PS_FIND_SCRIPT, 'utf-8')
  }
  return findScriptPath
}

/**
 * Check if CS2 window exists (lightweight, no console injection).
 * Used for polling CS2 readiness without opening the console.
 */
export async function findCs2Window(): Promise<boolean> {
  try {
    const script = ensureFindScript()
    const result = await execPowershell(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${script}"`,
      8_000
    )
    return result.trim() === 'FOUND'
  } catch {
    return false
  }
}
