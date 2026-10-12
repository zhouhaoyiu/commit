#!/usr/bin/env powershell
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$signing = 'config'
$signoff = $false
$push = $true
$message = 'some changes'
$messageSet = $false
$positional = New-Object 'System.Collections.Generic.List[string]'

function Show-Usage {
  @'
Usage: pcommit [options] [-m <message> | message ...]
  -h, --help           Print help and exit
  -v, --version        Print version and exit
  -a, --author         Print tool author and exit
  -m, --message TEXT   Use one argument as the commit message; quote spaces
  -np, --no-push       Commit without pushing
  -s, --sign           Cryptographically sign the commit using Git settings
  -ns, --no-sign       Disable signing, including commit.gpgSign
  --signoff           Add a Signed-off-by trailer (not a signature)
  --no-signoff         Do not add a Signed-off-by trailer
  --                  Treat remaining arguments as a positional message
Signing follows Git configuration unless --sign or --no-sign is given.
Without a message, the default is "some changes". Multiple positional
arguments are joined with spaces. Do not mix -m with positional arguments.
'@
}

function Stop-Usage([string] $Text) {
  [Console]::Error.WriteLine("Error: $Text")
  exit 2
}

for ($index = 0; $index -lt $args.Length; $index++) {
  $argument = [string]$args[$index]
  switch -CaseSensitive ($argument) {
    { $_ -ceq '-h' -or $_ -ceq '--help' } { Show-Usage; exit 0 }
    { $_ -ceq '-v' -or $_ -ceq '--version' } { Write-Output 'Version: 1.0.0'; exit 0 }
    { $_ -ceq '-a' -or $_ -ceq '--author' } { Write-Output 'Author: ZhouHaoyu'; exit 0 }
    { $_ -ceq '-np' -or $_ -ceq '--no-push' } { $push = $false; break }
    { $_ -ceq '-s' -or $_ -ceq '--sign' } { $signing = 'yes'; break }
    { $_ -ceq '-ns' -or $_ -ceq '--no-sign' } { $signing = 'no'; break }
    '--signoff' { $signoff = $true; break }
    '--no-signoff' { $signoff = $false; break }
    { $_ -ceq '-m' -or $_ -ceq '--message' } {
      if ($index + 1 -ge $args.Length) { Stop-Usage "$argument requires a message" }
      if ($messageSet) { Stop-Usage 'Use -m only once' }
      $index++
      $message = [string]$args[$index]
      $messageSet = $true
      break
    }
    '--' {
      for ($index++; $index -lt $args.Length; $index++) { $positional.Add([string]$args[$index]) }
      break
    }
    default {
      if ($argument.StartsWith('--message=')) {
        if ($messageSet) { Stop-Usage 'Use --message only once' }
        $message = $argument.Substring('--message='.Length)
        $messageSet = $true
      } elseif ($argument.StartsWith('-')) {
        Stop-Usage "Unknown option: $argument"
      } else {
        $positional.Add($argument)
      }
    }
  }
}

if ($positional.Count -gt 0) {
  if ($messageSet) { Stop-Usage 'Do not mix -m with a positional message' }
  $message = [string]::Join(' ', $positional.ToArray())
}
if ([string]::IsNullOrWhiteSpace($message)) { Stop-Usage 'The commit message cannot be empty' }

function Invoke-Git([string[]] $GitArguments) {
  & git @GitArguments
  $code = $LASTEXITCODE
  if ($code -ne 0) { exit $code }
}

$messageFile = $null
try {
  Invoke-Git @('add', '.')
  $messageFile = [System.IO.Path]::GetTempFileName()
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($messageFile, $message, $utf8)
  $commitArguments = @('commit', '--file', $messageFile)
  if ($signing -eq 'yes') { $commitArguments += '--gpg-sign' }
  if ($signing -eq 'no') { $commitArguments += '--no-gpg-sign' }
  if ($signoff) { $commitArguments += '--signoff' }
  Invoke-Git $commitArguments
  if ($push) { Invoke-Git @('push') }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
} finally {
  if ($null -ne $messageFile) { Remove-Item -LiteralPath $messageFile -Force -ErrorAction SilentlyContinue }
}
exit 0
