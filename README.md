# Morphogen Pathways Static 3D Viewer

这是从 XYZ8 胎脑 3D 重建结果导出的可迁移静态可视化包（v2）。支持直接在本地打开，不需要 H5AD、Python、Node、CUDA、集群路径或外网。

## 启动

推荐：完整解压 ZIP 到新文件夹，使用 Chrome 或 Edge 双击打开 `index.html`，点击“选择解压后的文件夹”，选择直接包含 `index.html` 和 `data` 的 `Morphogen_pathways_static_viewer` 目录。浏览器的文件授权提示是为了读取本地数据；没有文件上传、没有网络服务。

不要直接在压缩软件里打开 HTML，也不要只复制 HTML 而漏掉数据文件。旧版直接打开时的模块脚本 CORS 阻断已修复。

可选 Python 3 方式：Windows 双击 `start_windows.bat`，自动选择空闲端口并打开浏览器；Linux/macOS 运行 `bash start_linux.sh`，浏览器访问终端打印的地址。也可运行 `python serve.py --open --port 0` 自动选择空闲端口。

## 功能

- 固定随机种子 `20260930` 的 2,000,000 个 50 µm 体素。
- 106 个预设基因中，104 个存在于最终 3D 基因交集中，按 SHH、WNT、BMP/TGF-beta、FGF、Retinoic acid、Additional genes 分组。SMAD8 和 RXRB 保留为缺失项，不能作为零表达处理或伪造数值。原分析包中的基因可用性不等于最终 48 片交集的可用性。
- 基因表达热图和 `celltype_majority`、`regions_majority`、`region_majority`、`leiden_majority` 四类 obs 标签着色。
- 旋转、缩放、轴向观察、点大小、不透明度、表达阈值、体素详情和 PNG 导出。
- 不提供运行时抽样、表达计算、虚拟切片、H5AD 导出、服务器 API 或 OmicOS。

## 数据语义

坐标来自最终 `ST1_ST119_xyz8_395layer_50um_mean.h5ad` 对应的 viewer cache；395 层中 48 层为真实观测层，其他为已经完成的重建层。每个点是 50 µm 体素，不是独立细胞。表达值是 bin mean expression，表达定位不等同于通路激活。

`serve.py` 只传输静态文件，浏览器中的 WebGL 绘制和稀疏表达解码是必要的显示操作，不会访问原始数据或执行重建。

## 运行要求

需要支持 WebGL 2 的现代 Chrome/Edge；建议开启浏览器图形加速。Python 3 仅用于可选 HTTP 启动方式。缺少浏览器原生 gzip 解压时会使用内置解压器。无需联网，不需要 SSH 或集群作业。浏览器仍使用本地 GPU 绘制，200 万点在低性能设备上可能较慢。必须完整解压 ZIP。

加载时显示文件读取、坐标校验和 GPU 初始化等阶段；HTTP 读取超过 60 秒会明确报错，WebGL 不可用或上下文丢失也会提示，不再无限停留在“读取数据”。数据校验按批次让出主线程，避免一次性字符串生成阻塞页面。

`serve.py` 默认仅监听 127.0.0.1；端口被占用时运行 `python serve.py --port 0 --open` 自动选择端口。也可将所有文件放到普通静态 HTTP 服务器；应用兼容原始 gzip 和 HTTP 已解压的表达数据。

表达图的颜色采用 log1p，并以当前基因正值的 p99.5 为上限；高于上限仅颜色饱和，点选数值不截断。不同基因的颜色范围各自独立，不能直接以同色推断跨基因的绝对表达相等。源文件含真实观测和合成层，图中表达不能全部解释为直接实测。

数据与程序使用相对路径；迁移整个解压目录即可。`data/manifest.json` 记录来源、固定样本种子、缺失基因和坐标平移；`SHA256SUMS.txt` 供完整性校验。Three.js 许可证随包附带。
