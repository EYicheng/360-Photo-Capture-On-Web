# 360° 全景照片拍摄（Web）

纯浏览器端的 **完整球面 360° 全景拍摄**应用：像 Raya360 一样，应用用陀螺仪引导你把手机对准一个个目标方向，**对准 + 站定后自动拍摄**，最终在浏览器内拼接成**等距柱状投影（equirectangular，2:1）全景图**，支持 360° 拖拽查看与导出下载，可一键部署到 Vercel / Netlify。

> 所有照片都只在你的浏览器本地处理，**不会上传到任何服务器**。

## 功能

- 📷 相机预览与前后摄像头切换（`getUserMedia` + `ImageCapture.grabFrame()` 快速抓帧）
- 🎯 **引导拍摄**：实时在画面中显示目标方向（准星 + 箭头 + 角度提示），把手机对准目标并**站定片刻**即自动拍摄
- 🌐 **完整球面**：多排俯仰（水平 + 上下 + 天顶/天底）覆盖整个球面，约 46 个方向
- 🧭 陀螺仪姿态换算（`deviceorientation` → 相机的 yaw/pitch/roll，含 roll 校正）
- 🧩 浏览器内全景拼接（旋转投影 + 像素空间羽化混合，`Float32` 累加保证精度）
- 🧲 **ORB 特征对齐**（经典 CV，非神经网络）：FAST 角点 + BRIEF 描述子 + RANSAC 旋转估计，逐对修正相机朝向，消除陀螺仪误差与主平面视差
- 🎯 **自动 FOV 标定**：拍摄时用「陀螺仪角度 + 画面位移」自动测出相机真实视场角
- 🔭 360° 查看器（Photo Sphere Viewer）：拖拽旋转、缩放、全屏、陀螺仪观看、自动旋转
- 💾 导出：下载高清全景图（JPEG），或打包下载原始照片（zip）
- 🎛️ 视场角（FOV）：优先**自动检测**相机视场角；结果页拖动滑杆**实时预览**接缝，只有导出时才计算高清图

## 本地运行

要求 Node.js ≥ 22.12（开发时使用 Node 26 + pnpm）。

```bash
pnpm install
pnpm dev
```

> 生产构建与测试：
>
> ```bash
> pnpm build   # 类型检查 + 打包到 dist/
> pnpm test    # 单元测试
> ```

## 使用说明

**手机（推荐，有陀螺仪）**

1. 点击「启动相机」并允许相机权限（默认后置摄像头）。
2. iOS 上如提示需要陀螺仪权限，点击「启用陀螺仪」。
3. 点击「开始拍摄」。画面中会出现**目标方向**：
   - 跟随箭头转动/俯仰手机，把目标点对准画面中央的准星；
   - 对准后保持手机**水平**并站定，进度圈走满即自动拍摄；
   - 依次完成水平一圈、上方、下方、天顶、天底所有方向。
4. 全部拍完后自动生成**低分辨率预览**。拖动 FOV 滑杆会**实时**更新接缝，满意后点击「导出全景图」生成高清图并下载。

**桌面端（无陀螺仪）**

1. 启动相机后点击「开始拍摄」，选择「手动」模式。
2. 原地转动/俯仰，每到一个位置点击一次「拍摄一张」。

## 工作原理

1. **姿态跟踪**：`deviceorientation`（或 `deviceorientationabsolute`）的 `alpha/beta/gamma` 通过 W3C 旋转矩阵换算成相机的 `(yaw=经度, pitch=纬度, roll=绕光轴)`（见 `src/math/orientation.ts`），并相对起始方向累积 yaw。
2. **引导**：把下一个目标方向投影到当前相机画面（复用拼接的投影函数），在画面中画出目标点/箭头；当 `|Δyaw|` 与 `|Δpitch|` 都小于阈值且稳定一段时间后自动抓拍。
3. **拼接**（`src/stitch/`）：假设相机绕节点原地旋转（无平移），把每张照片按记录的 `(yaw, pitch, roll)` 投影到等距柱状图上，重叠区域做像素空间羽化混合；靠近天顶/天底时经度覆盖按 `1/cos(pitch)` 展宽。照片只**解码一次并缓存**，之后调 FOV 的预览与最终导出都只做重投影。
4. **FOV 标定**（`calibration.ts`）：拍摄时对水平排相邻两张做 1D 列剖面相关，结合已知 yaw 间隔反推真实水平 FOV，自动修正引导蓝点与拼接比例。
5. **特征对齐**（`orb.ts` + `align.ts` + `linalg.ts`）：对同排相邻照片做 FAST 角点 + BRIEF 描述子匹配，用 RANSAC + 最邻近旋转估计相邻相机朝向，按排链式修正每张照片的 yaw/pitch/roll，减轻陀螺仪误差与视差（经典计算机视觉，非神经网络）。

## 部署到线上（HTTPS）

浏览器访问相机要求**安全上下文（HTTPS 或 localhost）**，Vercel / Netlify 默认提供 HTTPS。

### Vercel

```bash
pnpm add -g vercel   # 或 npx vercel
vercel               # 首次按提示登录并关联项目
vercel --prod        # 生产部署
```

### Netlify

```bash
pnpm add -g netlify-cli   # 或 npx netlify-cli
netlify deploy --prod --build
```

也可以直接在两个平台的 Web 控制台导入本仓库，构建命令 `pnpm build`、输出目录 `dist` 已分别在 `vercel.json` 与 `netlify.toml` 中配置好。

## 技术栈

- Vite + React 19 + TypeScript
- [Photo Sphere Viewer](https://photo-sphere-viewer.js.org/)（v5，基于 three.js）
- JSZip（导出原始照片）

## 已知限制

- 拼接假设**原地旋转（无平移）**；走动会带来视差接缝。
- 浏览器不暴露相机真实 FOV，需用界面滑杆标定以获得最佳接缝。
- 天顶/天底为单张拍摄，roll 误差会在顶部/底部留下轻微接缝。
- 依赖版本以安装时最新稳定版为准。

## 目录结构

```
src/
├── math/orientation.ts        # 设备姿态 → yaw/pitch/roll
├── capture/segmentPlanner.ts  # 球面拍摄角度规划
├── stitch/                    # 投影、混合、拼接主逻辑
├── hooks/                     # useCamera / useOrientation / useCaptureFlow
├── components/GuidanceOverlay.tsx  # 目标方向引导叠加层
├── viewer/PanoramaViewer.tsx  # 360° 查看器
└── components/                # 各界面
```

> [NOTICE]
> 此项目由纯 Vibe Coding 编写
