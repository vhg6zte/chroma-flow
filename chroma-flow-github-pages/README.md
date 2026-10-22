# 流光 · GitHub Pages 发布版

这是可直接上传到 GitHub Pages 的静态网页，包含流体、双手识别、表情联动、五指换色和自动换色。访客不需要 Python、Node.js、ChatGPT 账号或 GitHub 账号，只需浏览器与摄像头。

## 操作步骤

1. 登录 GitHub，创建一个新仓库，仓库名使用 `chroma-flow`，可见性选择 **Public**，勾选 **Add a README file** 后创建。
2. 将本压缩包完整解压。在仓库 **Code** 页面选择 **Add file → Upload files**。
3. 上传解压后的全部文件和文件夹，包括 `models`、`vendor`、`.nojekyll`。务必让 `index.html` 出现在仓库根目录，不能外套一层文件夹，也不要只上传 ZIP 压缩包。
4. 点击 **Commit changes** 保存。如果默认 README 与包内 README 重名，只上传除 README.md 外的其他文件即可；网页不依赖 README。
5. 打开 **Settings → Pages**，在 **Build and deployment** 下选择：
   - Source：**Deploy from a branch**
   - Branch：**main**
   - Folder：**/(root)**
   - 点击 **Save**。
6. 等待发布。在同一页面点击 **Visit site**，打开实际生成的 HTTPS 网址。发布通常需要几分钟，官方说明可能最多约 10 分钟。
7. 把这个网址发到 Windows 10 电脑，用 Edge 或 Chrome 打开。点击“开启摄像头互动”并允许摄像头访问。

网站地址的格式通常是 `https://你的GitHub用户名.github.io/chroma-flow/`，实际以 Pages 页面显示的地址为准。这个包已适配仓库子目录，不需要把仓库命名成个人主页。

## 注意

- 模型和识别库都放在仓库内，不依赖国外字体或模型 CDN。
- 公有仓库的代码与模型文件会公开；包内没有账号密码或部署凭据。
- 普通网页无法保证在每一种网络下都可达；请在目标 Windows 10 电脑实际测试。
- 资源首次加载约 30 MB，请等待识别模型加载完成。摄像头识别需要浏览器 WebGL 与硬件加速。
- 自由模式下张开任意一只手五指、保持 0.7 秒可换色，先收起再张开可再次换色；左侧“自动换色”每 10 秒切换一套配色。
- 截图、录屏和登录功能均未包含。

## 官方参考

- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository

## 开源授权

流体引擎：Pavel Dobryakov / MIT，见 `vendor/LICENSE-fluid`。
MediaPipe：Google / Apache-2.0，见 `vendor/LICENSE-mediapipe`。
