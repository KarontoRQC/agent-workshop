# `ip.xtznai.com` 服务器远程连接教程

本文用于让同一台 Windows 电脑、同一 Windows 账号下的其他 Codex 窗口连接 `ip.xtznai.com` 生产服务器。

本文不包含私钥内容。禁止把 `~/.ssh/codex_temp` 的内容复制到聊天、仓库、日志、邮件或即时通讯中。

## 一分钟快速连接

本机已经配置 SSH 别名。新窗口只需在 PowerShell 中执行：

```powershell
ssh ip-xtznai
```

非交互式连通性检查：

```powershell
ssh -o BatchMode=yes ip-xtznai "printf 'CONNECTED\n'; whoami; hostname"
```

正常结果应包含 `CONNECTED` 和 `root`。检查完成后，交互式会话可执行 `exit` 退出。

## 给其他 Codex 窗口的指令

可以把下面这段话直接发给其他窗口：

```text
先阅读 deploy/SERVER_REMOTE_ACCESS.md。使用 `ssh ip-xtznai` 连接生产服务器；先执行只读检查，不要输出任何私钥、token 或 .env 内容。涉及部署时，必须先暂存、校验和备份，再原子切换，失败立即回滚。
```

## 当前连接配置

用户级配置文件位于 `~/.ssh/config`，对应模板是 `deploy/ip-xtznai.ssh-config.example`：

```sshconfig
Host ip-xtznai
    HostName 120.25.172.3
    User root
    Port 22
    IdentityFile ~/.ssh/codex_temp
    IdentitiesOnly yes
    StrictHostKeyChecking yes
    ServerAliveInterval 30
    ServerAliveCountMax 3
```

如果别名暂时不可用，可使用直接命令排查：

```powershell
ssh -i "$HOME\.ssh\codex_temp" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes root@120.25.172.3
```

查看 SSH 实际解析到的非敏感配置：

```powershell
ssh -G ip-xtznai | Select-String '^(hostname|user|port|identityfile) '
```

## 服务器关键位置

| 项目 | 位置 |
|---|---|
| 线上域名 | `https://ip.xtznai.com/` |
| 服务器地址 | `120.25.172.3` |
| SSH 用户 | `root` |
| Nginx 站点配置 | `/etc/nginx/conf.d/ip.xtznai.com.conf` |
| 网站根目录 | `/var/www/ip.xtznai.com/dist` |
| 发布备份目录 | `/var/www/ip.xtznai.com/backups/` |

## 只读检查命令

首次进入服务器时，先确认连接对象和站点状态：

```bash
whoami
hostname
nginx -t
curl -fsSI https://ip.xtznai.com/
find /var/www/ip.xtznai.com/dist -maxdepth 2 -type f -printf '%p\n' | sort
```

`nginx -t` 可能显示服务器上既有的 `conflicting server name "_"` 警告；只要最后明确显示配置语法与测试成功，该警告不影响 `ip.xtznai.com` 当前站点运行。不要在没有确认其他虚拟主机用途前擅自修改这项全局配置。

## 安全部署原则

更新页面时必须遵守以下顺序：

1. 将新版本上传到 `/var/www/ip.xtznai.com/.releases/<时间戳>/`，不要直接覆盖线上目录。
2. 校验文件数量、SHA-256、`index.html` 引用、JSON 格式及静态资源是否齐全。
3. 运行 `nginx -t`。
4. 将当前 `/var/www/ip.xtznai.com/dist` 移到 `/var/www/ip.xtznai.com/backups/dist-before-<时间戳>`。
5. 使用同一文件系统内的 `mv` 把已验证版本切换为 `dist`。
6. 验证首页、JS、CSS、JSON、HTTP 到 HTTPS 跳转以及桌面端和移动端页面。
7. 任一健康检查失败，立即把失败版本移回暂存目录并恢复备份。

禁止先执行 `rm -rf /var/www/ip.xtznai.com/dist`。禁止在终端输出 `.env`、私钥、API token 或完整授权头。

## 其他电脑或其他 Windows 账号

其他电脑或 Windows 账号不会共享本机的 `~/.ssh`，不能仅靠这个别名直接连接。推荐为每台设备单独创建密钥：

```powershell
ssh-keygen -t ed25519 -a 100 -f "$HOME\.ssh\ip_xtznai_ed25519" -C "ip-xtznai access"
```

只把生成的 `.pub` 公钥交给已经能连接服务器的管理员窗口，由管理员追加到 `/root/.ssh/authorized_keys`。不要传输没有 `.pub` 后缀的私钥文件。授权完成后，把该设备 `~/.ssh/config` 中的 `IdentityFile` 改为：

```sshconfig
IdentityFile ~/.ssh/ip_xtznai_ed25519
```

需要撤销某台设备时，从服务器 `/root/.ssh/authorized_keys` 删除该设备对应的单行公钥即可；修改前先备份该文件。

## 常见故障

### `Permission denied (publickey)`

检查别名解析和密钥文件是否存在：

```powershell
ssh -G ip-xtznai | Select-String '^(hostname|user|port|identityfile) '
Test-Path "$HOME\.ssh\codex_temp"
```

不要把私钥内容打印出来排查。

### 22 端口超时

```powershell
Test-NetConnection 120.25.172.3 -Port 22
```

如果端口不可达，检查当前网络、服务器安全组和防火墙。

### 主机指纹变化

出现 `REMOTE HOST IDENTIFICATION HAS CHANGED` 时立即停止连接，先通过服务器控制台或可信管理员核对新指纹。禁止为了消除提示而直接删除 `known_hosts` 记录。
