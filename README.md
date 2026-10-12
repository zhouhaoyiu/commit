# commit

在当前目录执行 `git add .`、`git commit` 和 `git push`。`git add` 或 `git commit` 失败会立即停止，不会继续推送；`git push` 失败也会返回非零退出码。推送失败时，本地提交仍然保留。

## 使用方法

需要 Git，以及 Bash 或 PowerShell。安装命令：

```shell
npm link
```

在 Bash（包括 Git Bash）中使用 `bcommit`，在 PowerShell 中使用 `pcommit`：

```shell
bcommit -m "fix login"
bcommit -np "fix login"
```

```powershell
pcommit -np -m "fix login"
pcommit -h
```

未安装命令时，可直接运行 `bash bin/commit.sh -np -m "fix login"` 或 `pwsh -NoProfile -File bin/commit.ps1 -np -m "fix login"`。`pcommit` 的启动器使用 `powershell`；仅安装了 PowerShell 7 的 macOS/Linux 环境可用上述 `pwsh -File` 方式运行。

## 参数

| 参数 | 行为 |
| --- | --- |
| `-h`, `--help` | 输出帮助后退出 |
| `-v`, `--version` | 输出工具版本后退出 |
| `-a`, `--author` | 输出工具作者后退出 |
| `-m TEXT`, `--message TEXT`, `--message=TEXT` | 使用一个参数作为提交消息；含空格时须加引号 |
| `-np`, `--no-push` | 提交后不推送 |
| `-s`, `--sign` | 使用 Git 配置的密钥和签名格式，对提交作密码学签名 |
| `-ns`, `--no-sign` | 禁用密码学签名，也覆盖 `commit.gpgSign=true` |
| `--signoff` | 添加 `Signed-off-by` 尾注 |
| `--no-signoff` | 取消本次命令中的 `--signoff` |
| `--` | 将后续所有参数作为位置形式的提交消息 |

查询帮助、版本和作者不会执行任何 Git 操作。`-m` 消耗其后一个参数，消息里的 `-h`、`-np` 等文字不会被当作开关。开关可放在 `-m` 及其消息之前或之后。

也可用位置参数指定消息：`bcommit -np fix login` 的消息为 `fix login`；多个位置参数用一个空格连接，各参数内部的空格保留。省略消息时使用 `some changes`。重复 `-m`、混用 `-m` 和位置消息、未知开关、缺失或空白消息会在暂存文件前报错，退出码为 2。

签名默认遵循 Git 配置。`--sign` 和 `--no-sign` 同时出现时，以最后一个为准。需要强制签名时，先在 Git 中配置密钥和签名格式，再使用 `--sign`。签名失败会阻止推送。

旧实现使用 `git commit -s`，实际作用是添加 `Signed-off-by` 尾注。现在尾注由 `--signoff` 单独控制，默认不添加；密码学签名使用 `--gpg-sign` / `--no-gpg-sign`。需要保留原来的尾注行为时，请显式加上 `--signoff`。

## 测试

测试需要 Node.js 22+、Bash、PowerShell、支持 SSH 提交签名的 Git（2.34+）和 `ssh-keygen`。不需要 npm 依赖。测试必须找到两种 shell，缺少任一运行时会报错。

```shell
npm test
```

可用 `BASH_BIN` 和 `POWERSHELL_BIN` 指定可执行文件路径，默认分别为 `bash` 和 `pwsh`。测试在临时目录创建 Git 仓库、本地裸仓库、隔离的 Git 配置和临时 SSH 密钥，验证参数解析、查询无副作用、提交和推送失败、签名及尾注。不会推送到 GitHub，也不使用个人签名密钥。

GitHub Actions 配置了 Linux PowerShell 7、Windows PowerShell 7 和 Windows PowerShell 5.1 的测试任务，Windows 的 Bash 测试使用 Git Bash。各平台是否通过以实际 CI 结果为准。
