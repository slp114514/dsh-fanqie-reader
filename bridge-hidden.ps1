param(
  [string]$Instance = 'Nougat64',
  [string]$Player = 'C:\Program Files\BlueStacks_nxt\HD-Player.exe'
)

$ErrorActionPreference = 'Stop'
$desktopName = 'DSH-Fanqie-' + (Get-Date -Format 'HHmmss')

Add-Type -AssemblyName System.Runtime.InteropServices
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class HiddenDesktop {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct STARTUPINFO {
    public int cb;
    public string lpReserved;
    public string lpDesktop;
    public string lpTitle;
    public int dwX, dwY, dwXSize, dwYSize;
    public int dwXCountChars, dwYCountChars;
    public int dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2;
    public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct PROCESS_INFORMATION {
    public IntPtr hProcess, hThread;
    public int dwProcessId, dwThreadId;
  }

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr CreateDesktop(string lpszDesktop, IntPtr lpszDevice, IntPtr pDevmode, int dwFlags, uint dwDesiredAccess, IntPtr lpsa);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool CloseDesktop(IntPtr hDesktop);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumWindowsProc callback, IntPtr lParam);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool CreateProcess(string lpApplicationName, string lpCommandLine, IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles, uint dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory, ref STARTUPINFO lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);
}
"@

$desktop = [HiddenDesktop]::CreateDesktop($desktopName, [IntPtr]::Zero, [IntPtr]::Zero, 0, 0x10000000, [IntPtr]::Zero)
if ($desktop -eq [IntPtr]::Zero) { throw "CreateDesktop failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }

$si = New-Object HiddenDesktop+STARTUPINFO
$si.cb = [Runtime.InteropServices.Marshal]::SizeOf($si)
$si.lpDesktop = $desktopName
$pi = New-Object HiddenDesktop+PROCESS_INFORMATION
$cmd = '"' + $Player + '" --instance ' + $Instance
$ok = [HiddenDesktop]::CreateProcess($Player, $cmd, [IntPtr]::Zero, [IntPtr]::Zero, $false, 0, [IntPtr]::Zero, (Split-Path $Player), [ref]$si, [ref]$pi)
if (-not $ok) { throw "CreateProcess failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
Write-Output "desktop=$desktopName pid=$($pi.dwProcessId)"

# Watch the hidden desktop and close obvious BlueStacks promo/update/legal popups.
# The main player window is deliberately left alone.
$script:closed = @()
$callback = {
  param([IntPtr]$hwnd, [IntPtr]$lparam)
  $title = New-Object Text.StringBuilder 512
  $class = New-Object Text.StringBuilder 256
  [HiddenDesktop]::GetWindowText($hwnd, $title, $title.Capacity) | Out-Null
  [HiddenDesktop]::GetClassName($hwnd, $class, $class.Capacity) | Out-Null
  $t = $title.ToString().Trim()
  $c = $class.ToString().Trim()
  if ($t -or $c) {
    Write-Output ("win hwnd={0} visible={1} class={2} title={3}" -f $hwnd, [HiddenDesktop]::IsWindowVisible($hwnd), $c, $t)
  }
  $isMain = $t -match '^BlueStacks App Player'
  $isPopup = ($t -match '(?i)app.?center|welcome|update|terms|privacy|promotion|广告|活动|通知|教程|新手') -or ($c -match '(?i)Qt.*Popup|Chrome_WidgetWin_0')
  if (-not $isMain -and $isPopup) {
    [HiddenDesktop]::PostMessage($hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    $script:closed += $t
  }
  return $true
}

while (Get-Process -Id $pi.dwProcessId -ErrorAction SilentlyContinue) {
  [HiddenDesktop]::EnumDesktopWindows($desktop, $callback, [IntPtr]::Zero) | Out-Null
  Start-Sleep -Seconds 5
}

Write-Output ("closed=" + ($script:closed -join ' | '))
Write-Output "Hidden desktop closed. pid=$($pi.dwProcessId)"
[HiddenDesktop]::CloseDesktop($desktop) | Out-Null
