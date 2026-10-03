<#
.SYNOPSIS
  Report every console window that appears while the E2E suite runs.

.DESCRIPTION
  Polls the desktop for visible classic console (ConsoleWindowClass) and
  Windows Terminal (CASCADIA_HOSTING_WINDOW_CLASS) windows and prints one
  "NEW <handle>|<class>|<title>" line per window that wasn't there at start.
  Clipy is a GUI app: any such window means a child process was spawned
  without CREATE_NO_WINDOW and flashed a terminal at the user.
#>
$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class ConsoleWindows {
  delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);

  public static List<string> Visible() {
    var found = new List<string>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var cls = new StringBuilder(256);
      GetClassName(h, cls, cls.Capacity);
      var name = cls.ToString();
      if (name == "ConsoleWindowClass" || name == "CASCADIA_HOSTING_WINDOW_CLASS") {
        var title = new StringBuilder(512);
        GetWindowText(h, title, title.Capacity);
        found.Add(h.ToInt64() + "|" + name + "|" + title);
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

$seen = @{}
foreach ($w in [ConsoleWindows]::Visible()) { $seen[$w.Split("|")[0]] = $true }
[Console]::Out.WriteLine("READY")
[Console]::Out.Flush()

# where.exe and ffprobe finish in tens of milliseconds, so poll fast.
while ($true) {
  foreach ($w in [ConsoleWindows]::Visible()) {
    $id = $w.Split("|")[0]
    if (-not $seen.ContainsKey($id)) {
      $seen[$id] = $true
      [Console]::Out.WriteLine("NEW $w")
      [Console]::Out.Flush()
    }
  }
  Start-Sleep -Milliseconds 20
}
