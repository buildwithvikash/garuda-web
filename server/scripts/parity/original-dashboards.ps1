# Calls the ORIGINAL dashboard code (Avatar.Business.AVWRLDashboards and the Brazing page's AssignData from Garuda.dll)
# with real WebForms control objects, and prints what it wrote into them as JSON.
# Usage: powershell -File original-dashboards.ps1 <binDir> <calls.json>   (connection string in $env:PARITY_CONN)
param([string]$Bin, [string]$CallsFile)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Web
Add-Type -AssemblyName System.Web.DataVisualization
foreach ($d in 'Yojak', 'Akaar', 'Avatar', 'Garuda') { [void][Reflection.Assembly]::LoadFrom((Join-Path $Bin "$d.dll")) }
[Yojak.DataConnection]::connectionString = $env:PARITY_CONN

$req = New-Object System.Web.HttpRequest('', 'http://localhost/', '')
$resp = New-Object System.Web.HttpResponse((New-Object IO.StringWriter))
$ctx = New-Object System.Web.HttpContext($req, $resp)
$items = New-Object System.Web.SessionState.SessionStateItemCollection
$session = New-Object System.Web.SessionState.HttpSessionStateContainer('parity', $items, (New-Object System.Web.HttpStaticObjectsCollection), 20, $true,
  [System.Web.HttpCookieMode]::UseCookies, [System.Web.SessionState.SessionStateMode]::InProc, $false)
[System.Web.SessionState.SessionStateUtility]::AddHttpSessionStateToContext($ctx, $session)
[System.Web.HttpContext]::Current = $ctx

function Lbl { New-Object System.Web.UI.WebControls.Label }
function Html { New-Object System.Web.UI.HtmlControls.HtmlGenericControl('canvas') }
function Grid { New-Object System.Web.UI.WebControls.GridView }
function NewChart { $c = New-Object System.Web.UI.DataVisualization.Charting.Chart; $c.Series.Add('Default') | Out-Null; $c.Legends.Add('L') | Out-Null; $c }
function Rows($dt) {
  # ArrayList + leading comma so PowerShell doesn't unroll 0- or 1-row results
  $list = New-Object System.Collections.ArrayList
  if ($null -ne $dt) { foreach ($r in $dt.Rows) { [void]$list.Add([string[]]@($r.ItemArray | ForEach-Object { "$_" })) } }
  return , $list.ToArray()
}

$shifts = @{}
function Shift($dept) {
  if (-not $shifts.ContainsKey($dept)) {
    if ($env:PARITY_SHIFT) {
      # Replay a past shift: same DataTable shape GetCurrentShiftandPeriod returns
      $o = $env:PARITY_SHIFT | ConvertFrom-Json
      $t = New-Object System.Data.DataTable
      foreach ($col in 'ShiftCode', 'ShiftName', 'STimeStamp', 'ETimeStamp') { [void]$t.Columns.Add($col) }
      [void]$t.Rows.Add($o.ShiftCode, $o.ShiftName, $o.STimeStamp, $o.ETimeStamp)
      $shifts[$dept] = $t
    } else { $shifts[$dept] = [Avatar.Settings]::GetCurrentShiftandPeriod([int]$dept) }
  }
  ,$shifts[$dept]
}
$pageType = [Reflection.Assembly]::LoadFrom((Join-Path $Bin 'Garuda.dll')).GetTypes() | Where-Object { $_.Name -in 'BrazingDashboard', 'VISIBrazingDashboard', 'SUSBrazingDashboard' }

$out = foreach ($c in (Get-Content $CallsFile -Raw -Encoding UTF8 | ConvertFrom-Json)) {
  try {
    $dt = Shift $c.dept
    $w = if ($dt.Rows.Count) { [Avatar.Business.AVWRLDashboards]::new($dt) } else { $null }; if ($null -eq $w -and $c.fn -notin "monthly","shift") { throw "no shift" }
    $r = $null
    switch ($c.fn) {
      'foamDial' {
        $dial = Html; $gv = Grid
        $m = @{ '' = 'FoamDialAssginValues'; '12304' = 'FoamDialAssginValuesSUS'; '12605' = 'FoamDialAssginValuesVISI' }["$($c.remark)"]
        $w.$m($c.station, 't', 'u', $dial, $gv, $c.activity)
        $r = @{ value = $dial.Attributes['data-value']; rows = Rows $gv.DataSource }
      }
      'cabinetDial' {
        $dial = Html; $gv = Grid
        if ($c.remark) { $w.CabinetDialAssginValuesVISI($c.station, 't', 'u', $dial, $gv) } else { $w.CabinetDialAssginValues($c.station, 't', 'u', $dial, $gv) }
        $r = @{ value = $dial.Attributes['data-value']; rows = Rows $gv.DataSource }
      }
      'monthly' {
        $l = 1..5 | ForEach-Object { $x = Lbl; $x.Text = '0'; $x }
        $o = New-Object Avatar.Business.AVWRLDashboards
        if ($c.variant -eq 'VISI') { $o.LabelAssignValuesVISI($l[0], $l[1], $l[2], $l[3], $l[4], $c.process) } else { $o.LabelAssignValues($l[0], $l[1], $l[2], $l[3], $l[4], $c.process) }
        $r = @{ monthlyProductionQty = $l[0].Text; monthlyAchievement = $l[1].Text; remainingQty = $l[2].Text; remainingDays = $l[3].Text; askingRate = $l[4].Text }
      }
      'hourly' {
        $c1 = Html; $c2 = Html; $l = 1..4 | ForEach-Object { Lbl }; $ch = NewChart
        $m = @{ production = 'HourlyProductionPerformance'; loading = 'HourlyLoadingPerformance'; preAssemblyA = 'HourlyPreAssemblyAPerformance'; preAssemblyB = 'HourlyPreAssemblyBPerformance' }[$c.hourly]
        $w.$m($c1, $l[0], $c2, $l[1], $l[2], $l[3], $ch, '0', [int]$c.selection)
        $r = @{ shiftProgress = $c1.Attributes['data-progress']; runningHour = $l[0].Text; achievement = $c2.Attributes['data-progress']; plan = $l[1].Text; achieved = $l[2].Text; remaining = $l[3].Text; chart = Rows $ch.DataSource }
      }
      'quality' {
        $c1 = Html; $l = 1..7 | ForEach-Object { Lbl }; $ch = NewChart
        $w.QualityPerformance($c1, $l[0], $l[1], $l[2], $l[3], $l[4], $l[5], $l[6], $ch, $c.processes, [int]$c.selection)
        $r = @{ shiftProgress = $c1.Attributes['data-progress']; updatedHour = $l[0].Text; packing = $l[1].Text; actual = $l[2].Text; ok = $l[3].Text; defect = $l[4].Text; okPercentage = $l[5].Text; defectPercentage = $l[6].Text; chart = Rows $ch.DataSource }
      }
      'station' {
        $gv = Grid; $w.WRLStationStatusDashboard($c.location, $gv); $r = @{ rows = Rows $gv.DataSource }
      }
      'brazing' {
        $t = $pageType | Where-Object { $_.Name -eq ($(if ($c.visi) { 'VISIBrazingDashboard' } elseif ($c.sus) { 'SUSBrazingDashboard' } else { 'BrazingDashboard' })) }
        $page = [Activator]::CreateInstance($t)
        $mi = $t.GetMethod($(if ($c.visi) { 'AssignDataVISI' } else { 'AssignData' }), [Reflection.BindingFlags]'NonPublic,Instance,Public')
        $lb = [System.Web.UI.WebControls.Label]::new(); $ch = (NewChart).psobject.BaseObject
        $gv = [System.Web.UI.WebControls.GridView]::new(); $img = [System.Web.UI.WebControls.Image]::new()
        [void]$mi.Invoke($page, [object[]]@($c.station, $lb, $dt.Rows[0]['STimeStamp'].ToString(), $dt.Rows[0]['ETimeStamp'].ToString(), $ch, $gv, $img))
        $r = @{ name = $lb.Text; rows = Rows $gv.DataSource; chart = Rows $ch.DataSource }
      }
      'shift' {
        $r = if ($dt.Rows.Count) { @{ ShiftCode = "$($dt.Rows[0]['ShiftCode'])"; ShiftName = "$($dt.Rows[0]['ShiftName'])"; STimeStamp = "$($dt.Rows[0]['STimeStamp'])"; ETimeStamp = "$($dt.Rows[0]['ETimeStamp'])" } } else { $null }
      }
    }
    [pscustomobject]@{ id = $c.id; ok = $true; result = $r }
  } catch {
    $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }
    [pscustomobject]@{ id = $c.id; ok = $false; error = $e.Message }
  }
}
$out | ConvertTo-Json -Depth 8 -Compress
