# Runs the ORIGINAL AVLogin code (from the published DLLs) for each case and prints JSON results.
# Usage: powershell -File original-login.ps1 <binDir> <cases.json>   (connection string in $env:PARITY_CONN)
param([string]$Bin, [string]$CasesFile)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Web
foreach ($d in 'Yojak', 'Akaar', 'Avatar') { [void][Reflection.Assembly]::LoadFrom((Join-Path $Bin "$d.dll")) }

[Yojak.DataConnection]::connectionString = $env:PARITY_CONN

function New-Context {
  $req = New-Object System.Web.HttpRequest('', 'http://localhost/', '')
  $res = New-Object System.Web.HttpResponse((New-Object IO.StringWriter))
  $ctx = New-Object System.Web.HttpContext($req, $res)
  $items = New-Object System.Web.SessionState.SessionStateItemCollection
  $statics = New-Object System.Web.HttpStaticObjectsCollection
  $session = New-Object System.Web.SessionState.HttpSessionStateContainer('parity', $items, $statics, 20, $true,
    [System.Web.HttpCookieMode]::UseCookies, [System.Web.SessionState.SessionStateMode]::InProc, $false)
  [System.Web.SessionState.SessionStateUtility]::AddHttpSessionStateToContext($ctx, $session)
  [System.Web.HttpContext]::Current = $ctx
  [Avatar.WrapperAvatar]::ERP = 'WRL'
}

New-Context
[Avatar.Settings]::SetSettings()

$results = foreach ($c in (Get-Content $CasesFile -Raw | ConvertFrom-Json)) {
  New-Context
  $login = New-Object Avatar.AVLogin
  try {
    if ($c.qr) { $msg = $login.ValidateLoginQR($c.userId, $c.password, [int]$c.businessUnit, '', '', 1) }
    else { $msg = $login.ValidateLogin($c.userId, $c.password, [int]$c.businessUnit, '', '', 0) }
    $s = [System.Web.HttpContext]::Current.Session
    [pscustomobject]@{ id = $c.id; msg = $msg; userCode = "$($s['UserCode'])"; businessUnit = "$($s['BusinessUnit'])"; department = "$($s['Department'])" }
  } catch {
    [pscustomobject]@{ id = $c.id; msg = 'EX: ' + $_.Exception.InnerException.Message; userCode = ''; businessUnit = ''; department = '' }
  }
}
$results | ConvertTo-Json -Depth 3 -Compress
