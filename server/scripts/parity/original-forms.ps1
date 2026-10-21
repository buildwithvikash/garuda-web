# Runs the ORIGINAL form engine (Akaar.AActions / ControlA, Avatar.AVViewControl) on control trees built from the
# extracted form specs, and prints what the controls hold afterwards. Read-only modes: "new" (InitalizeForm+ClearForm),
# "display" (ClearForm+Display of a key), "list" (Fill_Data page 0 / search). Write modes: "save", "update", "cancel".
# Usage: powershell -File original-forms.ps1 <binDir> <cases.json>   (connection string in $env:PARITY_CONN)
param([string]$Bin, [string]$CasesFile)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Web
foreach ($d in 'Yojak', 'Akaar') { [void][Reflection.Assembly]::LoadFrom((Join-Path $Bin "$d.dll")) }
[void][Reflection.Assembly]::LoadFrom((Join-Path $Bin 'Avatar.dll'))
[Yojak.DataConnection]::connectionString = $env:PARITY_CONN

function New-Session($c) {
  $req = New-Object System.Web.HttpRequest('', 'http://localhost/', '')
  $ctx = New-Object System.Web.HttpContext($req, (New-Object System.Web.HttpResponse((New-Object IO.StringWriter))))
  $s = New-Object System.Web.SessionState.HttpSessionStateContainer('p', (New-Object System.Web.SessionState.SessionStateItemCollection), (New-Object System.Web.HttpStaticObjectsCollection), 20, $true, [System.Web.HttpCookieMode]::UseCookies, [System.Web.SessionState.SessionStateMode]::InProc, $false)
  [System.Web.SessionState.SessionStateUtility]::AddHttpSessionStateToContext($ctx, $s)
  [System.Web.HttpContext]::Current = $ctx
  $s['BusinessUnit'] = "$($c.ctx.businessUnit)"; $s['UserCode'] = "$($c.ctx.userCode)"; $s['UserId'] = "$($c.ctx.userId)"; $s['Department'] = "$($c.ctx.department)"; if ($c.ctx.line) { $s['ProductionLine'] = "$($c.ctx.line)"; $s['ProductionLineName'] = "$($c.ctx.lineName)" }
  # LoginForm puts these web.config appSettings in the session (WrapperAvatar.ERP etc.)
  if (-not $script:appSettings) {
    $script:appSettings = @{}
    $cfg = Join-Path (Split-Path $Bin -Parent) 'Web.config'
    if (Test-Path $cfg) { foreach ($a in ([xml](Get-Content $cfg -Raw)).configuration.appSettings.add) { $script:appSettings[$a.key] = $a.value } }
  }
  foreach ($k in 'ERP', 'ERPURL', 'MFT', 'BUCODE') { if ($script:appSettings.ContainsKey($k)) { $s[$k] = $script:appSettings[$k] } }
}

# QCValueCaptureControl as its markup builds it: every child control field created (added as children), the markup's
# texts / hidden panels / status items, and GVDetails' columns with its RowDataBound wired
function QF($qc, $n) { return $script:qcType.GetField($n, [Reflection.BindingFlags]'NonPublic,Public,Instance').GetValue($qc) }
function NewQC {
  if (-not $script:garuda) { $script:garuda = [Reflection.Assembly]::LoadFrom((Join-Path $Bin 'Garuda.dll')) }
  $script:qcType = $script:garuda.GetType('Garuda.UserControl.QCValueCapture')
  if (-not $script:qcBtnTemplate) {
    Add-Type -ReferencedAssemblies System.Web -WarningAction SilentlyContinue -TypeDefinition 'using System.Web.UI; using System.Web.UI.WebControls; public class ParityQcBtnTemplate : ITemplate { string id, cmd, text; public ParityQcBtnTemplate(string i, string c, string t) { id = i; cmd = c; text = t; } public void InstantiateIn(Control container) { var b = new Button(); b.ID = id; b.CommandName = cmd; b.Text = text; b.Visible = false; container.Controls.Add(b); } }'
    $script:qcBtnTemplate = $true
  }
  $qc = [Activator]::CreateInstance($script:qcType)
  foreach ($fi in $script:qcType.GetFields([Reflection.BindingFlags]'NonPublic,Public,Instance,DeclaredOnly')) {
    $t = $fi.FieldType
    if ([System.Web.UI.Control].IsAssignableFrom($t) -and -not $t.IsAbstract -and $t.GetConstructor([Type[]]@())) { $ctl = [Activator]::CreateInstance($t); $ctl.ID = $fi.Name; $fi.SetValue($qc, $ctl); $qc.Controls.Add($ctl) }
  }
  foreach ($p in @(@('lblTitle', 'Usage Desicion'), @('LblDescription', 'Description'), @('LblMaxMin', 'Min-Max'), @('LblValue', 'Value'), @('LblList', 'Select from List'), @('Label1', 'Remark'), @('Label2', 'Quality Status'), @('Label31', 'AssetID'), @('BtnPrevious', ([char]0xAB + ' Previous')), @('btnSave', 'Save'), @('BtnNext', ('Next ' + [char]0xBB)), @('Go', 'Go'))) { (QF $qc $p[0]).Text = $p[1] }
  (QF $qc 'TBValue').TextMode = [System.Web.UI.WebControls.TextBoxMode]::Number
  (QF $qc 'TBBarcode').Attributes['Tag'] = '|||'
  (QF $qc 'TopDataPanel').Visible = $false; (QF $qc 'InstrumentPanel').Visible = $false
  $st = QF $qc 'DdlQCStatus'; [void]$st.Items.Add([System.Web.UI.WebControls.ListItem]::new('Pass', '1')); [void]$st.Items.Add([System.Web.UI.WebControls.ListItem]::new('Fail', '0'))
  (QF $qc 'GuideImage').ImageUrl = '~/Assets/Images/QualityInspection.jpg'
  $gv = QF $qc 'GVDetails'; $gv.AutoGenerateColumns = $false; $gv.DataKeyNames = [string[]]@('LineCode')
  $cf = [System.Web.UI.WebControls.CommandField]::new(); $cf.ShowSelectButton = $true; [void]$gv.Columns.Add($cf)
  foreach ($d in 'LineCode', 'Name', 'qcvalue', 'remark') { $bf = [System.Web.UI.WebControls.BoundField]::new(); $bf.DataField = $d; [void]$gv.Columns.Add($bf) }
  [void]$gv.Columns.Add([System.Web.UI.WebControls.TemplateField]::new())
  foreach ($b in @(@('btnReject', 'Fail'), @('btnApproved', 'Pass'))) { $tf = [System.Web.UI.WebControls.TemplateField]::new(); $tf.ItemTemplate = [ParityQcBtnTemplate]::new($b[0], $b[1], $b[1]); [void]$gv.Columns.Add($tf) }
  $rdb = $script:qcType.GetMethod('GVDetails_RowDataBound', [Reflection.BindingFlags]'NonPublic,Public,Instance')
  $gv.add_RowDataBound({ param($sender, $e) [void]$rdb.Invoke($qc, [object[]]@($sender, $e)) }.GetNewClosure())
  return $qc
}
function QcSnap($qc) {
  $vs = [System.Web.UI.Control].GetProperty('ViewState', [Reflection.BindingFlags]'NonPublic,Instance').GetValue($qc)
  $dt = $vs['QCDataTable']
  $rows = $null
  if ($dt) { $rows = @(foreach ($r in $dt.Rows) { $o = [ordered]@{}; foreach ($col in $dt.Columns) { $x = $r[$col]; $o[$col.ColumnName] = $(if ($x -is [DBNull]) { $null } else { $x.ToString() }) }; $o }) }
  # Visible reads through the parents: the QC shown while its children are read gives their own setting
  $qcVisible = $qc.Visible; $qc.Visible = $true
  $grid = @(foreach ($gr in (QF $qc 'GVDetails').Rows) {
    $cl = $gr.Cells[3]; $cb = $cl.FindControl('CBVal')
    $txt = $(if ($cb) { "CB:$($cb.Checked)" } elseif (@($cl.Controls | Where-Object { $_ -is [System.Web.UI.WebControls.Image] }).Count) { 'IMG' } else { $t = [System.Web.HttpUtility]::HtmlDecode($cl.Text); $(if ($t -eq [string][char]0xA0) { '' } else { $t }) })
    ,@($txt, $gr.FindControl('btnReject').Visible, $gr.FindControl('btnApproved').Visible)
  })
  $L = { param($n) QF $qc $n }
  $o = [ordered]@{
    visible = $qcVisible; title = "$((& $L 'lblTitle').Text)"; topData = (& $L 'TopDataPanel').Visible; dataPanel = (& $L 'DataPanel').Visible
    desc = "$((& $L 'LblDescription').Text)"; guide = @((& $L 'GuideImage').Visible, "$((& $L 'GuideImage').ImageUrl)"); maxmin = @((& $L 'LblMaxMin').Visible, "$((& $L 'LblMaxMin').Text)")
    lblValue = (& $L 'LblValue').Visible; value = @((& $L 'TBValue').Visible, "$((& $L 'TBValue').TextMode)", "$((& $L 'TBValue').Text)")
    uom = @((& $L 'DDLUom').Visible, "$((& $L 'DDLUom').SelectedValue)"); lblList = (& $L 'LblList').Visible
    list = @((& $L 'DDLList').Visible, "$((& $L 'DDLList').SelectedValue)", (@((& $L 'DDLList').Items | ForEach-Object { "$($_.Value)=$($_.Text)" }) -join '|'))
    pnlImage = (& $L 'PnlImage').Visible; tbImage = "$((& $L 'TBImage').Text)"; image = "$((& $L 'Image').ImageUrl)"; remark = "$((& $L 'TBRemark').Text)"
    label2 = (& $L 'Label2').Visible; status = @((& $L 'DdlQCStatus').Visible, "$((& $L 'DdlQCStatus').SelectedValue)"); instrument = (& $L 'InstrumentPanel').Visible
    barcode = @("$((& $L 'TBBarcode').Text)", "$((& $L 'TBBarcode').Attributes['Tag'])"); prev = @((& $L 'BtnPrevious').Enabled, "$((& $L 'BtnPrevious').Text)"); next = @((& $L 'BtnNext').Enabled, "$((& $L 'BtnNext').Text)")
    index = "$($vs['Index'])"; rows = $rows; grid = $grid
  }
  $qc.Visible = $qcVisible
  return $o
}

function Build($spec, $withPage = $false) {
  $top = [System.Web.UI.WebControls.Panel]::new(); $top.ID = 'TopPanel'; $top.Attributes['Tag'] = $spec.top.tag
  $byId = @{}
  foreach ($c in $spec.controls) {
    # Only controls the engine looks at (Tag with 4+ segments); others play no part in it.
    # (event mode also builds the page's own controls: editors, panels, buttons)
    $imageUc = "$($c.type)" -like 'UserControl:uimg:*'
    $comboUc = "$($c.type)" -eq 'UserControl:cbc:comboboxcontrol'
    $engine = $null -ne $c.tag -and @($c.tag).Count -ge 4 -and (-not "$($c.type)".StartsWith('UserControl:') -or $imageUc -or $comboUc)
    if (-not $engine -and -not ($withPage -and $c.id -and $c.type -in 'TextBox', 'DropDownList', 'ListBox', 'Panel', 'Button', 'CheckBox', 'Label', 'GridView', 'UserControl:qc:qc', 'Image' -and $c.id -notin 'TitleControl', 'StatusBar')) { continue }
    $w = $null
    if ($c.type -eq 'TextBox') { $w = [System.Web.UI.WebControls.TextBox]::new() }
    elseif ($c.type -eq 'DropDownList') { $w = [System.Web.UI.WebControls.DropDownList]::new(); foreach ($i in $c.items) { [void]$w.Items.Add([System.Web.UI.WebControls.ListItem]::new($i.text, $i.value)) } }
    elseif ($c.type -eq 'ListBox') { $w = [System.Web.UI.WebControls.ListBox]::new() }
    elseif ($c.type -eq 'Label') { $w = [System.Web.UI.WebControls.Label]::new(); $w.Text = $c.text }
    elseif ($c.type -eq 'CheckBox') { $w = [System.Web.UI.WebControls.CheckBox]::new() }
    elseif ($c.type -eq 'CheckBoxList') { $w = [System.Web.UI.WebControls.CheckBoxList]::new(); foreach ($i in $c.items) { [void]$w.Items.Add([System.Web.UI.WebControls.ListItem]::new($i.text, $i.value)) } }
    elseif ($c.type -eq 'Panel') { $w = [System.Web.UI.WebControls.Panel]::new() }
    elseif ($c.type -eq 'Button') { $w = [System.Web.UI.WebControls.Button]::new(); $w.Text = "$($c.text)" }
    elseif ($c.type -eq 'TreeView') { $w = [System.Web.UI.WebControls.TreeView]::new() }
    elseif ($c.type -eq 'UserControl:qc:qc') { $w = NewQC }
    elseif ($c.type -eq 'Image') { $w = [System.Web.UI.WebControls.Image]::new() }
    elseif ($comboUc) {
      # ComboBoxControl: the engine recognises it by its compiled type name ("…comboboxcontrol_ascx")
      if (-not $script:comboType) {
        if (-not $script:garuda) { $script:garuda = [Reflection.Assembly]::LoadFrom((Join-Path $Bin 'Garuda.dll')) }
        Add-Type -TypeDefinition 'namespace ASP { public class usercontrol_comboboxcontrol_ascx : Garuda.UserControl.ComboBoxControl { } }' -ReferencedAssemblies @((Join-Path $Bin 'Garuda.dll'), 'System.Web') -WarningAction SilentlyContinue
        $script:comboType = [ASP.usercontrol_comboboxcontrol_ascx]
      }
      $w = [Activator]::CreateInstance($script:comboType)
      $cb = [System.Web.UI.WebControls.DropDownList]::new(); $cb.ID = 'combobox'; $w.Controls.Add($cb)
      $pn = [System.Web.UI.WebControls.Panel]::new(); $pn.ID = 'Panel1'; $w.Controls.Add($pn)
      $bf = [Reflection.BindingFlags]'NonPublic,Instance'
      [Garuda.UserControl.ComboBoxControl].GetField('combobox', $bf).SetValue($w, $cb)
      [Garuda.UserControl.ComboBoxControl].GetField('Panel1', $bf).SetValue($w, $pn)
    }
    elseif ($imageUc) {
      # UploadImage / CaptureImage user control: hidden TBImage (data URL) + Image
      $w = [System.Web.UI.UserControl]::new()
      $t = [System.Web.UI.WebControls.TextBox]::new(); $t.ID = 'TBImage'; $w.Controls.Add($t)
      $im = [System.Web.UI.WebControls.Image]::new(); $im.ID = 'Image'; $w.Controls.Add($im)
    }
    elseif ($c.type -eq 'GridView') {
      # a grid with no columns in the markup generates them from its data (e.g. a calendar the page builds)
      $w = [System.Web.UI.WebControls.GridView]::new(); $w.AutoGenerateColumns = @($c.columns).Count -eq 0
      if ($c.attrs.datakeynames) { $w.DataKeyNames = [string[]]@($c.attrs.datakeynames.Split(',')) }
      foreach ($col in $c.columns) {
        if ($col.kind -eq 'boundfield') { $bf = [System.Web.UI.WebControls.BoundField]::new(); $bf.DataField = $col.dataField; $bf.HeaderText = $col.header; [void]$w.Columns.Add($bf) }
        elseif ($col.kind -eq 'commandfield') { $cf = [System.Web.UI.WebControls.CommandField]::new(); $cf.ShowDeleteButton = $true; [void]$w.Columns.Add($cf) }
        elseif ($col.kind -eq 'templatefield') {
          # <ItemTemplate><asp:TextBox ID="tb<Header>" Text='<%# Bind("<Header>") %>' /></ItemTemplate>
          if (-not $script:tbTemplate) {
            Add-Type -ReferencedAssemblies System.Web -WarningAction SilentlyContinue -TypeDefinition 'using System.Web.UI; using System.Web.UI.WebControls; public class ParityTbTemplate : ITemplate { string id, field; public ParityTbTemplate(string i, string f) { id = i; field = f; } public void InstantiateIn(Control container) { var tb = new TextBox(); tb.ID = id; tb.DataBinding += (s, e) => { var row = (GridViewRow)tb.NamingContainer; var v = DataBinder.Eval(row.DataItem, field); tb.Text = v == null ? "" : v.ToString(); }; container.Controls.Add(tb); } }'
            $script:tbTemplate = $true
          }
          $fname = "$($col.header)".Replace(' ', '')
          $tf = [System.Web.UI.WebControls.TemplateField]::new(); $tf.HeaderText = $col.header; $tf.FooterText = $col.footer
          # a bound TextBox only where the template holds one bound to a column (a row-command Button binds nothing)
          if ($fname -ne '' -and ($null -eq $col.template -or $col.template.type -eq 'TextBox')) { $tf.ItemTemplate = [ParityTbTemplate]::new("tb$fname", $fname) }
          elseif ($col.template.type -eq 'Button') {
            if (-not $script:btnTemplate) {
              Add-Type -ReferencedAssemblies System.Web -WarningAction SilentlyContinue -TypeDefinition 'using System.Web.UI; using System.Web.UI.WebControls; public class ParityBtnTemplate : ITemplate { string id, cmd, text; public ParityBtnTemplate(string i, string c, string t) { id = i; cmd = c; text = t; } public void InstantiateIn(Control container) { var b = new Button(); b.ID = id; b.CommandName = cmd; b.Text = text; container.Controls.Add(b); } }'
              $script:btnTemplate = $true
            }
            $tf.ItemTemplate = [ParityBtnTemplate]::new("$($col.template.id)", "$($col.template.command)", "$($col.template.text)")
          }
          [void]$w.Columns.Add($tf)
        }
      }
    }
    if ($null -eq $w) { continue }
    if ($c.id) { $w.ID = $c.id }
    if ($null -ne $c.tag) { $w.Attributes['Tag'] = ($c.tag -join '|') }
    if ($c.attrs.readonly -eq 'True' -and $w -is [System.Web.UI.WebControls.TextBox]) { $w.ReadOnly = $true }
    if ($c.attrs.enabled -eq 'false') { $w.Enabled = $false }
    if ($c.attrs.visible -eq 'false') { $w.Visible = $false }
    # inside its panel, as in the markup (Visible reads through the panels around it)
    $holder = if ($c.parent -and $byId[$c.parent] -is [System.Web.UI.WebControls.Panel]) { $byId[$c.parent] } else { $top }
    $holder.Controls.Add($w)
    if ($c.id) { $byId[$c.id] = $w }
  }
  return @{ top = $top; byId = $byId }
}

function SetValues($f, $values) {
  if ($null -eq $values) { return }
  foreach ($p in $values.PSObject.Properties) {
    $w = $f.byId[$p.Name]; if ($null -eq $w) { continue }
    if ($w -is [Garuda.UserControl.ComboBoxControl]) { $cb = $w.FindControl('combobox'); $cb.Items.Clear(); if ("$($p.Value)" -ne '') { [void]$cb.Items.Add([System.Web.UI.WebControls.ListItem]::new("$($p.Value)", "$($p.Value)")); $cb.SelectedIndex = 0 } }
    elseif ($script:qcType -and $w -is $script:qcType) { }
    elseif ($w -is [System.Web.UI.UserControl]) { $w.FindControl('TBImage').Text = "$($p.Value)" }
    elseif ($w -is [System.Web.UI.WebControls.TextBox]) { $w.Text = "$($p.Value)" }
    elseif ($w -is [System.Web.UI.WebControls.DropDownList] -or $w -is [System.Web.UI.WebControls.ListBox]) { $w.ClearSelection(); $li = $w.Items.FindByValue("$($p.Value)"); if ($li) { $li.Selected = $true } }
    elseif ($w -is [System.Web.UI.WebControls.CheckBox]) { $w.Checked = [bool]$p.Value }
    elseif ($w -is [System.Web.UI.WebControls.CheckBoxList]) {
      $on = @($p.Value | ForEach-Object { "$_" })
      foreach ($li in $w.Items) { $li.Selected = $on -contains $li.Value }
    }
    elseif ($w -is [System.Web.UI.WebControls.TreeView]) {
      $on = @($p.Value | ForEach-Object { "$_" })
      foreach ($n in $w.Nodes) { $n.Checked = $on -contains $n.Value; foreach ($ch in $n.ChildNodes) { $ch.Checked = $on -contains $ch.Value; foreach ($g in $ch.ChildNodes) { $g.Checked = $on -contains $g.Value } } }
    }
    elseif ($w -is [System.Web.UI.WebControls.GridView]) {
      # the rows the page held in ViewState, bound so the cells carry their text like the real grid
      $dt = New-Object System.Data.DataTable
      $rows = @($p.Value)
      $names = New-Object System.Collections.ArrayList
      foreach ($r in $rows) { foreach ($q in $r.PSObject.Properties) { if (-not $names.Contains($q.Name)) { [void]$names.Add($q.Name) } } }
      foreach ($col in $w.Columns) { if ($col -is [System.Web.UI.WebControls.BoundField] -and -not $names.Contains($col.DataField)) { [void]$names.Add($col.DataField) } }
      foreach ($col in $w.Columns) { if ($col -is [System.Web.UI.WebControls.TemplateField]) { $tn = "$($col.HeaderText)".Replace(' ', ''); if (-not $names.Contains($tn)) { [void]$names.Add($tn) } } }
      foreach ($n in $names) { [void]$dt.Columns.Add($n) }
      foreach ($r in $rows) { $dr = $dt.NewRow(); foreach ($q in $r.PSObject.Properties) { $dr[$q.Name] = "$($q.Value)" }; $dt.Rows.Add($dr) }
      $w.DataSource = $dt; $w.DataBind()
    }
  }
}

function Snapshot($f) {
  $o = [ordered]@{}
  foreach ($k in $f.byId.Keys) {
    $w = $f.byId[$k]
    $s = [ordered]@{ visible = $w.Visible; enabled = $w.Enabled }
    if ($w -is [System.Web.UI.WebControls.TextBox]) { $s.value = $w.Text; $s.type = $w.Attributes['type']; $s.required = $w.Attributes['required'] -eq 'true'; $s.maxLength = $w.MaxLength }
    elseif ($w -is [System.Web.UI.WebControls.DropDownList] -or $w -is [System.Web.UI.WebControls.ListBox]) { $s.value = $w.SelectedValue; $s.required = $w.Attributes['required'] -eq 'true'; $s.options = @($w.Items | ForEach-Object { "$($_.Value)=$($_.Text)" }) }
    elseif ($w -is [System.Web.UI.WebControls.CheckBoxList]) { $s.options = @($w.Items | ForEach-Object { "$($_.Value)=$($_.Text)" }); $s.value = @($w.Items | Where-Object Selected | ForEach-Object Value) }
    elseif ($w -is [System.Web.UI.WebControls.CheckBox]) { $s.value = $w.Checked }
    elseif ($w -is [System.Web.UI.WebControls.Label]) { $s.text = $w.Text }
    elseif ($w -is [System.Web.UI.WebControls.Image]) { $s.value = "$($w.ImageUrl)" }
    elseif ($w -is [System.Web.UI.WebControls.Button]) { $s.text = $w.Text }
    elseif ($script:comboType -and $w -is [Garuda.UserControl.ComboBoxControl]) { $cb = $w.FindControl('combobox'); $s.value = $cb.SelectedValue; $s.options = @($cb.Items | ForEach-Object { "$($_.Value)=$($_.Text)" }) }
    elseif ($script:qcType -and $w -is $script:qcType) { $s.qc = QcSnap $w }
    elseif ($w -is [System.Web.UI.UserControl]) { $s.value = $w.FindControl('TBImage').Text }
    elseif ($w -is [System.Web.UI.WebControls.TreeView]) {
      $nodes = New-Object System.Collections.ArrayList; $on = New-Object System.Collections.ArrayList
      $walk = { param($x, $d) [void]$nodes.Add("${d}:$($x.Value)=$($x.Text)"); if ($x.Checked) { [void]$on.Add($x.Value) }; foreach ($y in $x.ChildNodes) { & $walk $y ($d + 1) } }
      foreach ($n in $w.Nodes) { & $walk $n 0 }
      $s.nodes = [string[]]$nodes.ToArray(); $s.value = [string[]]($on.ToArray() | Sort-Object)
    }
    elseif ($w -is [System.Web.UI.WebControls.GridView]) {
      $rows = New-Object System.Collections.ArrayList
      foreach ($gr in $w.Rows) { [void]$rows.Add([string[]]@(for ($i = 0; $i -lt $w.Columns.Count; $i++) { if ($w.Columns[$i] -is [System.Web.UI.WebControls.TemplateField]) { $tbx = $gr.Cells[$i].FindControl('tb' + "$($w.Columns[$i].HeaderText)".Replace(' ', '')); if ($tbx) { $tbx.Text } else { '' } } elseif ($w.Columns[$i] -is [System.Web.UI.WebControls.BoundField]) { $t = $gr.Cells[$i].Text; if ($t -eq "&nbsp;") { "" } else { [System.Web.HttpUtility]::HtmlDecode($t) } } })) }
      $s.rows = $rows.ToArray()
      if ($w.AutoGenerateColumns -and $w.DataSource -is [System.Data.DataTable]) {
        # generated columns: the day headers, and every shown cell the page coloured (a block of RowSpan rows)
        $dtc = $w.DataSource
        $s.days = [string[]]@($dtc.Columns | Select-Object -Skip 1 | ForEach-Object { $_.ColumnName })
        $blocks = New-Object System.Collections.ArrayList
        for ($ri = 0; $ri -lt $w.Rows.Count; $ri++) { for ($ci = 1; $ci -lt $w.Rows[$ri].Cells.Count; $ci++) { $cl = $w.Rows[$ri].Cells[$ci]; if ($cl.Visible -and -not $cl.BackColor.IsEmpty) { [void]$blocks.Add(@{ day = $s.days[$ci - 1]; start = $ri; span = [Math]::Max(1, $cl.RowSpan); color = $(if ($cl.BackColor.Name -eq 'Red') { 'busy' } else { 'free' }); text = $cl.Text }) } } }
        $s.blocks = $blocks.ToArray(); $s.rows = @()
        $s.colors = @(foreach ($gr in $w.Rows) { $(if ($gr.BackColor.IsEmpty) { '' } else { $gr.BackColor.Name.ToLower() }) })
        $s.autoRows = @(foreach ($r in $dtc.Rows) { ,[string[]]@(foreach ($col in $dtc.Columns) { $x = $r[$col]; $(if ($x -is [DBNull]) { '' } else { $x.ToString() }) }) })
      }
    }
    $o[$k] = $s
  }
  return $o
}

# Page_Load list fills of pages that do them inline (the same original calls)
function PageLoadFills($f, $spec) {
  if ($spec.file -eq 'View/Authorization/ResetPasswordForm.aspx') { [Avatar.AU]::new().FillDropDownList($f.byId['DDLUser'], "Select usercode,Concat(UserID, ' ',UserName)[userName] from Users order by UserID ") }
  if ($spec.file -eq 'View/Settings/RoutingUpdateForm.aspx') { [Avatar.AVProductionCapture]::new().ViewOpenJobCard($f.byId['DDLJobCard']) }
  if ($spec.file -eq 'View/Production/ProcessOrderPlanForm.aspx') { [Avatar.AVProductionCapture]::new().ViewMaterialProdOrder($f.byId['DDLCustomer']) }
  if ($spec.file -eq 'View/Production/ModelToModelTransferForm.aspx') { [Avatar.AU]::new().FillBarcodePrinterList($f.byId['DDLPrinter']) }
  if ($spec.file -eq 'View/Production/FGScrapForm.aspx') { [Avatar.AU]::new().FillDropDownList($f.byId['DDLScrapCategory'], 'Select ID,Type from ScrapReasons') }
}

# InitalizeForm, the page's own Page_Load code (pages that have some), then ClearForm
# TitleControl's own child controls (buttons, panels, ...) as on the real page: every unset control field created
function FillTitleControl($tc) {
  foreach ($fi in $tc.GetType().GetFields([Reflection.BindingFlags]'NonPublic,Public,Instance')) {
    $t = $fi.FieldType
    if ($null -eq $fi.GetValue($tc) -and [System.Web.UI.Control].IsAssignableFrom($t) -and -not $t.IsAbstract -and $t.GetConstructor([Type[]]@())) { $fi.SetValue($tc, [Activator]::CreateInstance($t)) }
  }
}

function Init($act, $f, $spec, $buVisible) {
  $act.InitalizeForm($f.top, [int]$spec.formModuleId, $buVisible)
  if ($spec.file -eq 'View/Settings/PrinterForm.aspx') { [Avatar.AU]::new().FillServerPrinterList($f.byId['DDLDriver']) }
  PageLoadFills $f $spec
  # the page's own InitializeForm() (list fills in Page_Load), run on the page class with its fields on our controls
  if (-not $script:garuda) { $script:garuda = [Reflection.Assembly]::LoadFrom((Join-Path $Bin 'Garuda.dll')) }
  $pt = if ($spec.inherits) { $script:garuda.GetType($spec.inherits) } else { $null }
  $pflags = [Reflection.BindingFlags]'NonPublic,Public,Instance,DeclaredOnly'
  $pinit = if ($pt) { $pt.GetMethod('InitializeForm', $pflags) } else { $null }
  if ($pinit) {
    $pg = [Activator]::CreateInstance($pt)
    foreach ($k in $f.byId.Keys) { $fld = $pt.GetField($k, $pflags); if ($fld -and $fld.FieldType.IsInstanceOfType($f.byId[$k])) { $fld.SetValue($pg, $f.byId[$k]) } }
    [void]$pinit.Invoke($pg, [object[]]@())
  }
  $act.ClearForm($f.top)
}

function Table($dt) {
  if ($null -eq $dt) { return $null }
  $rows = New-Object System.Collections.ArrayList
  foreach ($r in $dt.Rows) { [void]$rows.Add([string[]]@($r.ItemArray | ForEach-Object { if ($_ -is [DBNull]) { '' } else { $_.ToString() } })) }
  @{ columns = [string[]]@($dt.Columns | ForEach-Object ColumnName); rows = $rows.ToArray() }
}

$out = foreach ($c in (Get-Content $CasesFile -Raw -Encoding UTF8 | ConvertFrom-Json)) {
  try {
    New-Session $c
    $spec = $c.spec
    $f = Build $spec ($c.mode -eq "event")
    $act = [Akaar.AActions]::new()
    [Avatar.Settings]::SetSettings(); $buVisible = [Avatar.WrapperAvatar]::ParseBool([Avatar.Settings]::BusinessUnitVisible)
    $r = $null
    switch ($c.mode) {
      'new' { Init $act $f $spec $buVisible; $r = Snapshot $f }
      'display' {
        Init $act $f $spec $buVisible
        $key = $spec.view.tag.Split('|')[1].Split('.')[-1]
        # a page with its own display(key) (RRViewControl.displayHandler) runs that instead of Avctions.Display
        if (-not $script:garuda) { $script:garuda = [Reflection.Assembly]::LoadFrom((Join-Path $Bin 'Garuda.dll')) }
        $pt = if ($spec.inherits) { $script:garuda.GetType($spec.inherits) } else { $null }
        $pflags = [Reflection.BindingFlags]'NonPublic,Public,Instance,DeclaredOnly'
        $pd = if ($pt) { $pt.GetMethod('display', $pflags) } else { $null }
        if ($pd) {
          $pg = [Activator]::CreateInstance($pt)
          foreach ($k in $f.byId.Keys) { $fld = $pt.GetField($k, $pflags); if ($fld -and $fld.FieldType.IsInstanceOfType($f.byId[$k])) { $fld.SetValue($pg, $f.byId[$k]) } }
          $tpf = $pt.GetField('TopPanel', $pflags); if ($tpf) { $tpf.SetValue($pg, $f.top) }
          $tcf = $pt.GetField('TitleControl', $pflags); if ($tcf) { $tc = [Activator]::CreateInstance($tcf.FieldType); FillTitleControl $tc; $tcf.SetValue($pg, $tc) }
          $frm = [System.Web.UI.HtmlControls.HtmlForm]::new(); $frm.ID = 'form1'; $pg.Controls.Add($frm); $frm.Controls.Add($f.top)
          [void]$pd.Invoke($pg, [object[]]@("$($c.key)"))
          $csm = $pg.ClientScript; $alerts = New-Object System.Collections.ArrayList
          foreach ($fi in $csm.GetType().GetFields([Reflection.BindingFlags]'NonPublic,Instance')) { $val = $fi.GetValue($csm); if ($val -is [System.Collections.IEnumerable] -and $val -isnot [string] -and $val -isnot [System.Collections.IDictionary]) { foreach ($x in $val) { if ("$x" -match "OnError\(``(.*)``\)") { [void]$alerts.Add($Matches[1]) } } } }
          if ($alerts.Count) { throw $alerts[0] }
          $r = @{ controls = (Snapshot $f); status = -1 }
        } else {
          $st = $act.Display($f.top, $key, "$($c.key)"); $r = @{ controls = (Snapshot $f); status = $st }
        }
      }
      'list' {
        $view = [System.Web.UI.WebControls.Panel]::new(); $view.ID = 'ViewPanel'; $view.Attributes['Tag'] = $spec.view.tag
        $gv = [System.Web.UI.WebControls.GridView]::new(); $gv.PageSize = 10
        $vc = [Avatar.AVViewControl]::new()
        if ($c.search) {
          $str = $vc.Get_SearchSqlQuery($view, $vc.GetViewQuery($spec.view.tag.Split('|')[0]))
          $sql = $vc.Search($str, $c.search.column, $c.search.dotnet, $c.search.op, "$($c.search.value)", $gv, $view)
          $vc.Fill_Data($sql, $view, $gv, 0, 10)
        } elseif ($spec.view.tag.Split('|').Length -gt 5) {
          $vc.Fill_Data_V2($view, $gv, 0, 10, [DateTime]::Now.AddDays(-30).ToString('dd-MMM-yyyy'), [DateTime]::Now.ToString('dd-MMM-yyyy'), $true)
        } else { $vc.Fill_Data($view, $gv, 0, 10, $true) }
        $r = @{ count = $gv.VirtualItemCount; table = (Table $gv.DataSource) }
      }
      'save' {
        Init $act $f $spec $buVisible; SetValues $f $c.values
        $r = @{ key = $act.Save($f.top) }
      }
      'update' {
        Init $act $f $spec $buVisible
        $key = $spec.view.tag.Split('|')[1].Split('.')[-1]
        [void]$act.Display($f.top, $key, "$($c.key)"); SetValues $f $c.values
        $r = @{ key = $act.Update($f.top) }
      }
      'copy' {
        # TitleControl.BtnCopy_Click: BtnClear (ClearForm), Avctions.Copy, PrimaryKey emptied
        Init $act $f $spec $buVisible
        [void][Avatar.Avctions]::new().Copy($f.top, $spec.view.tag.Replace('|*', '').Split('|')[1], "$($c.key)")
        if ($f.byId['PrimaryKey']) { $f.byId['PrimaryKey'].Text = '' }
        $r = @{ controls = (Snapshot $f) }
      }
      'event' {
        # The page class itself (Garuda.dll), its control fields pointing at our controls (engine + page controls),
        # ViewState holding the grid's typed DataTable ("TransData") and the case's entries. Each step sets values,
        # then runs a handler (control event, button, or grid select/delete with the row's DataKey). Alerts are read
        # back from the page's registered client scripts.
        [Threading.Thread]::CurrentThread.CurrentCulture = [Globalization.CultureInfo]::new('en-IN', $true) # with this machine's settings, as the other modes
        if (-not $script:garuda) { $script:garuda = [Reflection.Assembly]::LoadFrom((Join-Path $Bin 'Garuda.dll')) }
        $type = $script:garuda.GetType($spec.inherits)
        $page = [Activator]::CreateInstance($type)
        $flags = [Reflection.BindingFlags]'NonPublic,Public,Instance'
        # the page's Request/Response (Response.Redirect after a password change)
        foreach ($pf in @(,@('_response', [System.Web.HttpContext]::Current.Response))) { $fi = [System.Web.UI.Page].GetField($pf[0], $flags); if ($fi) { $fi.SetValue($page, $pf[1]) } }
        foreach ($k in $f.byId.Keys) { $fld = $type.GetField($k, $flags); if ($fld -and $fld.FieldType.IsInstanceOfType($f.byId[$k])) { $fld.SetValue($page, $f.byId[$k]) } }
        $tpf = $type.GetField('TopPanel', $flags); if ($tpf) { $tpf.SetValue($page, $f.top) }
        $form = [System.Web.UI.HtmlControls.HtmlForm]::new(); $form.ID = 'form1'; $page.Controls.Add($form); $form.Controls.Add($f.top)
        [void][System.Web.UI.Page].GetMethod('SetForm', $flags).Invoke($page, [object[]]@($form))
        # UploadImage user control: the page reads Page.FindControl("ctl00$ContentPlaceHolder1$UploadImage$TBImage")
        $tbImage = $null
        if (@($spec.controls | Where-Object { $_.id -eq 'UploadImage' }).Count) {
          $parentC = $page
          foreach ($nm in 'ctl00', 'ContentPlaceHolder1', 'UploadImage') { $uc = [System.Web.UI.UserControl]::new(); $uc.ID = $nm; $parentC.Controls.Add($uc); $parentC = $uc }
          $tbImage = [System.Web.UI.WebControls.TextBox]::new(); $tbImage.ID = 'TBImage'; $parentC.Controls.Add($tbImage)
        }
        # Page_Load: InitalizeForm, the page's own InitializeForm() (list fills), then ClearForm (Add)
        $act.InitalizeForm($f.top, [int]$spec.formModuleId, $buVisible)
        $init = $type.GetMethod('InitializeForm', $flags); if ($init) { [void]$init.Invoke($page, [object[]]@()) }
        PageLoadFills $f $spec
        # TitleControl: the save handlers set its Success / Message
        $tcField = $type.GetField('TitleControl', $flags)
        if ($tcField) { $tc = [Activator]::CreateInstance($tcField.FieldType); $tcField.SetValue($page, $tc) } else { $tc = $null }
        if ($tc) {
          # TitleControl's printer list (GetCurrentPrinter) and print panels
          $tf = [Reflection.BindingFlags]'NonPublic,Instance'
          $dp = [System.Web.UI.WebControls.DropDownList]::new()
          if ("$($c.printer)" -ne '') { [void]$dp.Items.Add([System.Web.UI.WebControls.ListItem]::new("$($c.printer)", "$($c.printer)")); $dp.SelectedIndex = 0 }
          $fi = $tcField.FieldType.GetField('DDLPrinter', $tf); if ($fi) { $fi.SetValue($tc, $dp) }
          FillTitleControl $tc
          $f.top.Controls.Add($tc) # it sits in TopPanel (NewButton clears its Parent)
        }
        foreach ($fi in $type.GetFields([Reflection.BindingFlags]'NonPublic,Public,Instance,DeclaredOnly')) { $t = $fi.FieldType; if ($null -eq $fi.GetValue($page) -and [System.Web.UI.Control].IsAssignableFrom($t) -and -not $t.IsAbstract -and $t.GetConstructor([Type[]]@())) { try { $fi.SetValue($page, [Activator]::CreateInstance($t)) } catch { } } }
        # FooterControl: its child controls, in the page's form (its Save finds TopPanel through the page), first load
        $ftf = $type.GetField('Footer', $flags)
        if ($ftf -and $ftf.FieldType.Name -eq 'FooterControl' -and $ftf.GetValue($page)) { $ft = $ftf.GetValue($page); FillTitleControl $ft; $form.Controls.Add($ft); [void]$ft.GetType().GetMethod('Page_Load', $flags).Invoke($ft, [object[]]@($null, [EventArgs]::Empty)) }
        if ($script:qcType) { foreach ($qk in @($f.byId.Keys)) { if ($f.byId[$qk] -is $script:qcType) { [void]$script:qcType.GetMethod('Page_Load', $flags).Invoke($f.byId[$qk], [object[]]@($null, [EventArgs]::Empty)) } } }
        $act.ClearForm($f.top)
        if ($c.key) {
          # the page's own display(key) when it has one (RRViewControl.displayHandler)
          $pdm = $type.GetMethod('display', $flags)
          if ($pdm) { [void]$pdm.Invoke($page, [object[]]@("$($c.key)")) } else { [void]$act.Display($f.top, $spec.view.tag.Split('|')[1].Split('.')[-1], "$($c.key)") }
        }
        $vs = [System.Web.UI.Control].GetProperty('ViewState', $flags).GetValue($page)
        foreach ($p in @($c.viewState.PSObject.Properties)) { if ($p) { $vs[$p.Name] = "$($p.Value)" } }
        # every grid: the rows Display loaded (AssignData binds a DataTable), or the case's rows on an empty typed
        # table; ViewState keeps it under the page's key ("TransData" for GVTransData unless the case says otherwise)
        $vsKeys = @{ GVTransData = 'TransData' }
        foreach ($p in @($c.gridViewState.PSObject.Properties)) { if ($p) { $vsKeys[$p.Name] = "$($p.Value)" } }
        $grids = @{}
        foreach ($g in @($spec.controls | Where-Object { $_.type -eq 'GridView' -and $_.id -and $_.tag -and $f.byId[$_.id] })) {
          $gw = $f.byId[$g.id]; $grids[$g.id] = $gw
          $given = if ($c.gridRows) { $c.gridRows.PSObject.Properties[$g.id] } else { $null }
          if ($gw.DataSource -is [System.Data.DataTable] -and -not $given) { $dt = $gw.DataSource }
          elseif ("$($g.tag[0])".Trim() -eq '') {
            # a grid without a query (filled by page code): a table of its bound columns
            $dt = New-Object System.Data.DataTable
            foreach ($bc in $g.columns) { if ($bc.dataField -and -not $dt.Columns.Contains($bc.dataField)) { [void]$dt.Columns.Add($bc.dataField) } }
          }
          else { $dt = [Yojak.DataWrapper]::new().ExecuteDataTable("$($g.tag[0]) where $($g.tag[2])=-1 ") }
          if ($given) {
            foreach ($row in @($given.Value)) {
              if ($null -eq $row) { continue }
              $dr = $dt.NewRow()
              foreach ($q in $row.PSObject.Properties) { if ($dt.Columns.Contains($q.Name) -and "$($q.Value)" -ne '') { $dr[$q.Name] = "$($q.Value)" } }
              $dt.Rows.Add($dr)
            }
          }
          $gw.DataSource = $dt; $gw.DataBind()
          if ($vsKeys[$g.id]) { $vs[$vsKeys[$g.id]] = $dt }
        }
        # tables the page keeps in ViewState (e.g. an imported sheet), bound to the grid that shows them
        foreach ($t in @($c.dataTables)) {
          if (-not $t) { continue }
          $dt = New-Object System.Data.DataTable
          foreach ($cn in $t.columns) { [void]$dt.Columns.Add("$cn") }
          foreach ($row in $t.rows) { $dr = $dt.NewRow(); for ($i = 0; $i -lt $t.columns.Count; $i++) { if ($null -ne $row[$i]) { $dr[$i] = "$($row[$i])" } }; $dt.Rows.Add($dr) }
          $vs["$($t.key)"] = $dt.PSObject.BaseObject
          if ($t.grid) { $f.byId["$($t.grid)"].DataSource = $dt.PSObject.BaseObject; $f.byId["$($t.grid)"].DataBind() }
        }
        $grid = $grids['GVTransData']
        # the steps are postbacks: Page.IsPostBack and the lists' view state loaded, so "SelectedValue = <not listed>"
        # throws as it does on a real postback (outside one it is only cached)
        [System.Web.UI.Page].GetField('_requestValueCollection', $flags).SetValue($page, [System.Collections.Specialized.NameValueCollection]::new())
        foreach ($w in $f.byId.Values) { if ($w -is [System.Web.UI.WebControls.ListControl]) { [System.Web.UI.WebControls.ListControl].GetField('_stateLoaded', $flags).SetValue($w, $true) } }
        $savedKey = $null
        foreach ($step in @($c.steps)) {
          # a postback rebuilds the controls: no selection cached from the previous request
          foreach ($w in $f.byId.Values) { if ($w -is [System.Web.UI.WebControls.ListControl]) { foreach ($fn in 'cachedSelectedIndex', 'cachedSelectedValue') { $fi = [System.Web.UI.WebControls.ListControl].GetField($fn, $flags); if ($fi) { $fi.SetValue($w, $(if ($fn -eq 'cachedSelectedIndex') { -1 } else { $null })) } } } }
          $vals = $step.values
          if ($vals) {
            SetValues $f $vals
            if ($tbImage -and $vals.PSObject.Properties['UploadImage']) { $tbImage.Text = "$($vals.UploadImage)" }
          }
          # "__save" / "__update": TitleControl's default Save / Update of the form as it now stands
          if ($step.handler -eq '__save') { $savedKey = $act.Save($f.top); continue }
          if ($step.handler -eq '__update') { $savedKey = $act.Update($f.top); continue }
          if ($step.target -eq 'Footer') {
            $ft = $type.GetField('Footer', $flags).GetValue($page)
            [void]$ft.GetType().GetMethod("$($step.handler)", $flags).Invoke($ft, [object[]]@($null, [EventArgs]::Empty))
            continue
          }
          if ($step.target -eq 'QC') {
            # a QC child's input, then one of its handlers (a grid Select runs RowCommand, then SelectedIndexChanged)
            $qco = $f.byId[$(if ($step.qcId) { "$($step.qcId)" } else { 'QC' })]
            # a postback rebuilds the grid rows without the CBVal checkboxes MakeUpCheckBox added when rendering
            foreach ($gr in (QF $qco 'GVDetails').Rows) { $cbx = $gr.Cells[3].FindControl('CBVal'); if ($cbx) { [void]$gr.Cells[3].Controls.Remove($cbx) } }
            if ($step.qc) { foreach ($p in $step.qc.PSObject.Properties) { $w = QF $qco $p.Name; if ($w -is [System.Web.UI.WebControls.DropDownList]) { $w.ClearSelection(); $li = $w.Items.FindByValue("$($p.Value)"); if ($li) { $li.Selected = $true } } else { $w.Text = "$($p.Value)" } } }
            $qm = $script:qcType.GetMethod($step.handler, $flags)
            $gvq = QF $qco 'GVDetails'
            if ($step.handler -eq 'GVDetails_RowCommand') {
              $row = $gvq.Rows[[int]$step.index]
              $src = $(if ($step.command -eq 'Select') { $row.Cells[0].Controls[0] } elseif ($step.command -eq 'Fail') { $row.FindControl('btnReject') } else { $row.FindControl('btnApproved') })
              [void]$qm.Invoke($qco, [object[]]@($gvq, [System.Web.UI.WebControls.GridViewCommandEventArgs]::new($src, [System.Web.UI.WebControls.CommandEventArgs]::new("$($step.command)", $null))))
              if ($step.command -eq 'Select') { $gvq.SelectedIndex = [int]$step.index; [void]$script:qcType.GetMethod('GVDetails_SelectedIndexChanged', $flags).Invoke($qco, [object[]]@($gvq, [EventArgs]::Empty)) }
            } elseif ($qm.GetParameters()[1].ParameterType -eq [System.Web.UI.ImageClickEventArgs]) { [void]$qm.Invoke($qco, [object[]]@($null, [System.Web.UI.ImageClickEventArgs]::new(0, 0))) }
            else { [void]$qm.Invoke($qco, [object[]]@($null, [EventArgs]::Empty)) }
            continue
          }
          $m = $type.GetMethod($step.handler, $flags)
          if ($step.command -and $step.command -ne 'select' -and $step.command -ne 'delete') {
            # a row command (a Button in a TemplateField): RowCommand with that button as the source
            $cg = if ($step.grid) { $grids["$($step.grid)"] } else { $grid }
            $gcol = ($spec.controls | Where-Object { $_.id -eq $cg.ID }).columns | Where-Object { $_.template.command -eq $step.command } | Select-Object -First 1
            $btn = $cg.Rows[[int]$step.index].FindControl("$($gcol.template.id)")
            # RowCommand(grid, GridViewCommandEventArgs), or the button's own Click(button, EventArgs)
            if ($m.GetParameters()[1].ParameterType -eq [System.Web.UI.WebControls.GridViewCommandEventArgs]) { [void]$m.Invoke($page, [object[]]@($cg, [System.Web.UI.WebControls.GridViewCommandEventArgs]::new($btn, [System.Web.UI.WebControls.CommandEventArgs]::new($step.command, $null)))) }
            else { [void]$m.Invoke($page, [object[]]@($btn, [EventArgs]::Empty)) }
          } elseif ($step.command -eq 'select' -or $step.command -eq 'delete') {
            $cg = if ($step.grid) { $grids["$($step.grid)"] } else { $grid }
            if ($null -ne $step.index) { $idx = [int]$step.index } else { $idx = -1; for ($i = 0; $i -lt $cg.DataKeys.Count; $i++) { if ("$($cg.DataKeys[$i].Value)" -eq "$($step.arg)") { $idx = $i; break } } }
            if ($step.command -eq 'select') { $cg.SelectedIndex = $idx; [void]$m.Invoke($page, [object[]]@($cg, [EventArgs]::Empty)) }
            else { [void]$m.Invoke($page, [object[]]@($cg, [System.Web.UI.WebControls.GridViewDeleteEventArgs]::new($idx))) }
          } elseif ($m.GetParameters().Count -eq 0) {
            [void]$m.Invoke($page, [object[]]@())
          } elseif ($m.GetParameters()[1].ParameterType -eq [System.Web.UI.ImageClickEventArgs]) {
            [void]$m.Invoke($page, [object[]]@($f.byId[$step.control], [System.Web.UI.ImageClickEventArgs]::new(0, 0)))
          } else {
            [void]$m.Invoke($page, [object[]]@($f.byId[$step.control], [EventArgs]::Empty))
          }
          # the grids' DataBound handlers are not wired here: keep ViewState on the tables the grids now show
          foreach ($gid in @($grids.Keys)) { if ($vsKeys[$gid] -and $grids[$gid].DataSource -is [System.Data.DataTable]) { $vs[$vsKeys[$gid]] = $grids[$gid].DataSource } }
        }
        $csm = $page.ClientScript
        $alerts = New-Object System.Collections.ArrayList
        foreach ($fi in $csm.GetType().GetFields($flags)) {
          $val = $fi.GetValue($csm)
          if ($val -is [System.Collections.IDictionary]) { foreach ($x in $val.Values) { if ("$x" -match "alert\('(.*)'\)|OnError\(``(.*)``\)") { [void]$alerts.Add($(if ($Matches[1]) { $Matches[1] } else { $Matches[2] })) } } }
          elseif ($val -is [System.Collections.IEnumerable] -and $val -isnot [string]) { foreach ($x in $val) { if ("$x" -match "alert\('(.*)'\)|OnError\(``(.*)``\)") { [void]$alerts.Add($(if ($Matches[1]) { $Matches[1] } else { $Matches[2] })) } } }
        }
        $vsOut = [ordered]@{}; foreach ($k in $vs.Keys) { if ($k -ne 'TransData' -and $vs[$k] -isnot [System.Data.DataTable]) { $vsOut[$k] = "$($vs[$k])" } }
        $title = if ($tc) { @{ success = $tc.Success; message = "$($tc.Message)" } } else { $null }
        $r = @{ savedKey = "$savedKey"; controls = (Snapshot $f); alerts = [string[]]$alerts.ToArray(); viewState = $vsOut; redirect = [System.Web.HttpContext]::Current.Response.RedirectLocation; title = $title; sessionUser = "$([System.Web.HttpContext]::Current.Session['UserId'])" }
      }
      'excel' {
        # AExcelWrapper.ImportExcel on a workbook file: column names and each row's cells as text (DBNull -> null)
        $dt = [Akaar.AExcelWrapper]::ImportExcel("$($c.path)")
        $r = @{ columns = [string[]]@($dt.Columns | ForEach-Object { $_.ColumnName }); rows = @(foreach ($row in $dt.Rows) { ,@(foreach ($col in $dt.Columns) { $x = $row[$col]; $(if ($x -is [DBNull]) { $null } else { "$x" }) }) }) }
      }
      'copylist' {
        # TitleControl.Initialize_Form: copy field = Name when the first table has it, else Alias
        $av = [Avatar.Avctions]::new(); $av.InitalizeForm($f.top, [int]$spec.formModuleId)
        $field = if ($av.NameField -ne '') { 'Name' } else { 'Alias' }
        $dd = [System.Web.UI.WebControls.DropDownList]::new()
        [Avatar.AU]::new().FillComboBox($dd, "Select " + $spec.view.tag.Replace('|*', '').Split('|')[1] + "," + $field + " from " + $spec.top.tag.Replace('|*', '').Split('|')[0], 'Select To Copy')
        $dd.DataBind()
        $r = @{ options = @($dd.Items | ForEach-Object { "$($_.Value)=$($_.Text)" }) }
      }
      'cancel' {
        Init $act $f $spec $buVisible
        $key = $spec.view.tag.Split('|')[1].Split('.')[-1]
        [void]$act.Display($f.top, $key, "$($c.key)")
        $r = @{ key = $act.Delete($f.top, "$($c.remark)") }
      }
    }
    [pscustomobject]@{ id = $c.id; ok = $true; result = $r }
  } catch {
    $e = $_.Exception
    # event mode: the page shows the handler's own exception (only the reflection/PowerShell wrappers are removed)
    if ($c.mode -eq 'event') { while ($e.InnerException -and ($e -is [Reflection.TargetInvocationException] -or $e -is [System.Management.Automation.MethodInvocationException])) { $e = $e.InnerException } }
    else { while ($e.InnerException) { $e = $e.InnerException } }
    [pscustomobject]@{ id = $c.id; ok = $false; error = $(if ($env:PARITY_DEBUG) { "$($e.Message) @ line $($_.InvocationInfo.ScriptLineNumber)" } else { $e.Message }) }
  }
}
ConvertTo-Json -InputObject @($out) -Depth 10 -Compress
