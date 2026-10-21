# Calls ORIGINAL report methods (Avatar.AVReports / AVProductionCapture) by reflection and prints their tables
# with every cell as .NET ToString() in the current culture. Args: "s:<text>" string, "grid" a new GridView,
# "out" an out parameter. Returns the method result, each GridView's DataSource and each out value.
# Usage: powershell -File original-wrlreports.ps1 <binDir> <calls.json>   (connection string in $env:PARITY_CONN)
param([string]$Bin, [string]$CallsFile)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Web
foreach ($d in 'Yojak', 'Akaar') { [void][Reflection.Assembly]::LoadFrom((Join-Path $Bin "$d.dll")) }
$avatar = [Reflection.Assembly]::LoadFrom((Join-Path $Bin 'Avatar.dll'))
[Yojak.DataConnection]::connectionString = $env:PARITY_CONN

# Session-backed WrapperAvatar properties need an HttpContext
$req = New-Object System.Web.HttpRequest('', 'http://localhost/', '')
$ctx = New-Object System.Web.HttpContext($req, (New-Object System.Web.HttpResponse((New-Object IO.StringWriter))))
$session = New-Object System.Web.SessionState.HttpSessionStateContainer('p', (New-Object System.Web.SessionState.SessionStateItemCollection), (New-Object System.Web.HttpStaticObjectsCollection), 20, $true, [System.Web.HttpCookieMode]::UseCookies, [System.Web.SessionState.SessionStateMode]::InProc, $false)
[System.Web.SessionState.SessionStateUtility]::AddHttpSessionStateToContext($ctx, $session)
[System.Web.HttpContext]::Current = $ctx

function Table($dt) {
  if ($null -eq $dt -or $dt -isnot [System.Data.DataTable]) { return $null }
  $cols = [string[]]@($dt.Columns | ForEach-Object { $_.ColumnName })
  $rows = New-Object System.Collections.ArrayList
  foreach ($r in $dt.Rows) { [void]$rows.Add([string[]]@($r.ItemArray | ForEach-Object { if ($_ -is [DBNull]) { '' } else { $_.ToString() } })) }
  @{ columns = $cols; rows = $rows.ToArray() }
}

$out = foreach ($c in (Get-Content $CallsFile -Raw -Encoding UTF8 | ConvertFrom-Json)) {
  try {
    $type = $avatar.GetType("Avatar.$($c.cls)", $true)
    $obj = [Activator]::CreateInstance($type)
    $mi = $type.GetMethods() | Where-Object { $_.Name -eq $c.method -and $_.GetParameters().Count -eq $c.args.Count } | Select-Object -First 1
    $grids = @()
    $argv = [object[]]@(foreach ($a in $c.args) {
        if ($a -eq 'grid') { $g = [System.Web.UI.WebControls.GridView]::new(); $grids += $g; $g }
        elseif ($a -eq 'out') { $null }
        else { [string]$a.Substring(2) }
      })
    $result = $mi.Invoke($obj, $argv)
    $outs = @(for ($i = 0; $i -lt $c.args.Count; $i++) { if ($c.args[$i] -eq 'out') { $v = $argv[$i]; if ($v -is [System.Data.DataTable]) { Table $v } else { "$v" } } })
    [pscustomobject]@{ id = $c.id; ok = $true; result = (Table $result); grids = @($grids | ForEach-Object { Table $_.DataSource }); outs = $outs }
  } catch {
    $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }
    [pscustomobject]@{ id = $c.id; ok = $false; error = $e.Message }
  }
}
ConvertTo-Json -InputObject @($out) -Depth 8 -Compress
