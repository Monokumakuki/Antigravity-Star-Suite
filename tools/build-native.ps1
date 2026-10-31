$ErrorActionPreference = 'Stop'
$nativeSource = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../Antigravity-Cat-Widget/src/native/ForegroundHost.cs')).Path
$nativeOutput = [IO.Path]::ChangeExtension($nativeSource, '.exe')
& 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' '/nologo' '/target:exe' '/optimize+' ('/out:' + $nativeOutput) $nativeSource
if ($LASTEXITCODE -ne 0) { throw 'Native helper compilation failed' }
