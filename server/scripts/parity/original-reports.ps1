# Builds report SQL with the ORIGINAL ReportControl / ReportControlTime / ReportControlAdv classes from Garuda.dll:
# each control is placed in a minimal control tree next to a ReportPanel carrying the page's Tag, its filter controls
# are set, and its own Get_SqlQuery() (or Get_SqlQuerySearch for Adv search) is called. Prints JSON {id, sql|error}.
# Usage: powershell -File original-reports.ps1 <binDir> <cases.json>
param([string]$Bin, [string]$CasesFile)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Web
foreach ($d in 'Yojak', 'Akaar', 'Avatar') { [void][Reflection.Assembly]::LoadFrom((Join-Path $Bin "$d.dll")) }
$garuda = [Reflection.Assembly]::LoadFrom((Join-Path $Bin 'Garuda.dll'))
$types = @{ date = $garuda.GetType('Garuda.UserControl.ReportControl'); time = $garuda.GetType('Garuda.UserControl.ReportControlTime'); adv = $garuda.GetType('Garuda.UserControl.ReportControlAdv') }
$flags = [Reflection.BindingFlags]'NonPublic,Public,Instance'

function SetField($obj, $name, $value) {
  $f = $obj.GetType().GetField($name, $flags)
  if ($f) { $f.SetValue($obj, $value) }
}
function Ddl($value) {
  $d = [System.Web.UI.WebControls.DropDownList]::new()
  [void]$d.Items.Add([System.Web.UI.WebControls.ListItem]::new('', ''))
  if ($value) { [void]$d.Items.Add([System.Web.UI.WebControls.ListItem]::new($value, $value)); $d.SelectedValue = $value }
  $d
}
function Tb($text) { $t = [System.Web.UI.WebControls.TextBox]::new(); $t.Text = $text; $t }

$out = foreach ($c in (Get-Content $CasesFile -Raw -Encoding UTF8 | ConvertFrom-Json)) {
  try {
    $root = [System.Web.UI.Control]::new()
    $panel = [System.Web.UI.WebControls.Panel]::new(); $panel.ID = 'ReportPanel'; $panel.Attributes['Tag'] = $c.tag
    $root.Controls.Add($panel)
    $a = [System.Web.UI.Control]::new(); $b = [System.Web.UI.Control]::new()
    $root.Controls.Add($a); $a.Controls.Add($b)
    $rc = [Activator]::CreateInstance($types[$c.variant]); $b.Controls.Add($rc)
    SetField $rc 'DDLBusinessUnit' (Ddl $c.bu)
    SetField $rc 'DDLDepartment' (Ddl $c.department)
    SetField $rc 'DDLFilter' (Ddl $c.filter)
    SetField $rc 'From' (Tb $c.from)
    SetField $rc 'To' (Tb $c.to)
    SetField $rc 'ListColumns' ([System.Web.UI.WebControls.CheckBoxList]::new())
    $method = if ($c.search -and $c.variant -eq 'adv') { 'Get_SqlQuerySearch' } else { 'Get_SqlQuery' }
    $sql = $types[$c.variant].GetMethod($method, $flags).Invoke($rc, @())
    # Time's search path strips the ORDER BY segment before wrapping (IMBSearch_Click)
    $parts = $c.tag.Split('|')
    if ($c.search -and $c.variant -eq 'time' -and $parts.Count -gt 5 -and $parts[5].Trim() -ne '') { $sql = $sql.Replace(' ' + $parts[5], '') }
    [pscustomobject]@{ id = $c.id; sql = $sql }
  } catch {
    $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }
    [pscustomobject]@{ id = $c.id; error = $e.Message }
  }
}
ConvertTo-Json -InputObject @($out) -Depth 4 -Compress
