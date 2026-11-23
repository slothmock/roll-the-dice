param([Parameter(Mandatory=$true)][string]$Msi)
$ErrorActionPreference='Stop'
$installer=New-Object -ComObject WindowsInstaller.Installer
$db=$installer.OpenDatabase((Resolve-Path -LiteralPath $Msi).Path,0)
function Rows([string]$sql){
 $view=$db.OpenView($sql);[void]$view.Execute();$list=New-Object 'System.Collections.Generic.List[object]'
 $record=$view.Fetch()
 while($null -ne $record){
  $count=$record.GetType().InvokeMember('FieldCount','GetProperty',$null,$record,$null)
  $row=@();for($i=1;$i -le $count;$i++){$row+=,$record.StringData($i)}
  $list.Add($row)
  $record=$view.Fetch()
 }
 [void]$view.Close();return ,($list.ToArray())
}
$properties=@{};foreach($row in (Rows 'SELECT `Property`, `Value` FROM `Property`')){$properties[$row[0]]=$row[1]}
$result=[ordered]@{
 properties=$properties
 template=$db.SummaryInformation(0).Property(7)
 wordCount=$db.SummaryInformation(0).Property(15)
 directories=(Rows 'SELECT `Directory`, `Directory_Parent`, `DefaultDir` FROM `Directory`')
 files=(Rows 'SELECT `File`, `Component_`, `FileName`, `FileSize` FROM `File`')
 registry=(Rows 'SELECT `Registry`, `Root`, `Key`, `Name`, `Value`, `Component_` FROM `Registry`')
 shortcuts=(Rows 'SELECT `Shortcut`, `Directory_`, `Name`, `Target`, `WkDir` FROM `Shortcut`')
 dialogs=(Rows 'SELECT `Dialog` FROM `Dialog`')
 relatedProducts=@($installer.RelatedProducts($properties['UpgradeCode']))
}
$result | ConvertTo-Json -Depth 8 -Compress
[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($db)
[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($installer)
