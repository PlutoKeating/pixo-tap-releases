# PixoTap 公开发布仓库

本仓库只存放 PixoTap 官网的**编译产物**和桌面软件安装包的发布信息，**不包含任何源码**。

## 线上地址

官网生产地址：<https://pixotap.plutokeating.beer/>。整个 Cloudflare Worker（介绍页 `/`、下载页 `/download/`、账号中心 `/account/`、业务 API `/v1/*`）都绑定在这个域名上。

## 仓库内容

- `worker/`：Cloudflare Worker 的预构建产物（压缩后的服务代码、静态页面与素材、部署配置）。Cloudflare 直接连接本仓库并部署，路径为 `worker`。
- 桌面软件安装包与校验和通过本仓库的 GitHub Releases 发布；官网下载页在访问时实时读取这些发布信息，页面本身不内嵌任何版本号或发布说明。

## 说明

源码保存在私有仓库，不在此公开。素材与产品内容保留原有权利归属，未授予开源许可。
