#!/usr/bin/env powershell

$name = $args[0]


Write-Host "Creating page $name"

# 生成文件夹
mkdir $name
# 进入文件夹
Set-Location $name
# 在文件夹中生成文件
fsutil file createnew index.config.js 1000
# 生成文件
fsutil file createnew index.scss 1000
# 生成文件
fsutil file createnew index.vue 1000


