#!/usr/bin/env powershell
$sign="true"
$push="true"
$message="some changes"
#获得传入的参数
foreach ($i in $args) 
{
  $index=0
  if ($i -eq "-ns")
  {
    $sign=false
  }

  if ($i -eq "-np")
  {
    $push=false
  }

  if ($i -eq "-h")
  {
    Write-Host "Usage: commit [-ns] [-np] [-h] [-m] [message]"
    Write-Host "  -ns: do not sign the commit"
    Write-Host "  -np: do not push the commit"
    Write-Host "  -h: print this help"
    Write-Host "  -m: commit message"
    Write-Host "  message: commit message"
    exit 0
  }

  if ($i -eq "-v")
  {
    Write-Host "Version: 0.1"
  }

  if ($i -eq "-a")
  {
    Write-Host "Author: ZhouHaoyu"
  }

  if ($i -eq "-m")
  {
    $index=1
    $message=$args[$index]
    while ($index -lt $args.Length)
    {
      $index=$index+1
      $message=$message+" "+$args[$index]
    }
  }
}
Write-Host $message

git add .
Write-Host "git adding..."
if ($sign -eq $true)
{
  Write-Host "your commit will be signed"
  git commit -s -m "$message"
}
else
{
  git commit -m "$message"
}

if ($push -eq $true)
{
  Write-Host "your commit will be pushed"
  git push
}
else
{
  Write-Host "your commit will not be pushed"
}