# orp-screen

ORP 匿名实时大屏独立项目，携带中国省、市、区县三级行政边界及世界、四川、成都地图，通过 `/api/public/screens/events` 接收 ORP 后端公开的实时 SSE 数据。

## 本地预览

需要 Python 3。先启动 ORP 后端，再运行：

```sh
python3 -m http.server 5173 --directory public
```

浏览器访问 `http://localhost:5173/?map=100000&mode=2d` 查看全国省级边界。中国区域使用 6 位行政区代码，`100000` 表示全国，例如 `510000` 为四川省、`510100` 为成都市、`510104` 为锦江区；`mode` 支持 `2d`、`3d`。在地图上点击有下级区域的边界可逐级下钻，顶部层级导航可返回上一级。旧的 `world`、`sichuan`、`chengdu` 参数仍兼容。SSE 请求须通过同源反向代理转发到 ORP 后端，开发时可将 `/api/public/screens/` 代理到 `http://127.0.0.1:8081`。

Pilot 的“大屏展示”菜单提供行政区选择页，可按省、市、区县选择区域，再分别以 2D 或 3D 在新标签页打开；所有大屏标题栏均可切换亮色/暗色主题，并在同一浏览器中记住选择；亮色模式为行政区边界、3D 地形、地图标签和悬浮信息提供了更强对比。世界地图额外提供两种 GeoIP 场景：`scene=globe` 是可拖动旋转的浅青点阵地球，`scene=globe-light` 是浅色世界点阵图，带真实来源到中心的弧线和流动粒子、环境扫描动画。扫描动画仅是装饰效果；GeoIP 未返回位置和流线时不生成虚构业务点，页面显示等待真实 GeoIP 请求状态。常规大屏地图本身支持点击边界下钻和通过顶部层级导航返回。当前离线边界包含 34 个省级、407 个市级和 2,728 个区县级条目；直辖市下辖区县作为省级的直接下级，数据源没有更低层边界的县级市作为末级区域展示。全国、省和市级边界来自 [GeoJSON.CN 中国地图数据集](https://geojson.cn/data/atlas/china)，区县级边界来自 [阿里云 DataV GeoAtlas 公共 GeoJSON 接口](https://geo.datav.aliyun.com/areas_v3/bound/510100_full.json)。构建脚本 `scripts/download-admin-maps.mjs` 下载并生成层级索引，屏幕边界文件位于 `public/maps/admin/`，Pilot 选择器用的行政区索引副本位于 `openresty-pilot/orp-frontend/apps/web-antd/public/maps/admin-index.json`。更新地图数据后需同步该索引文件并重建 Pilot 前端和大屏容器。来源数据的边界精度、坐标参考和覆盖范围以各数据提供方的发布内容为准。实时来源点和流线仍来自后端 GeoIP 数据，不由行政区边界推算。全屏图标位于标题栏时钟旁，浏览器全屏状态变化（包含 Esc 退出）会同步更新图标。

## 构建与部署

构建仅依赖 Node.js 内置模块：

```sh
npm run build
```

产物位于 `dist/`。也可以直接构建容器：

```sh
docker build -t orp-screen:local .
```

容器默认监听 80 端口。Nginx 将匿名 SSE 代理到 `orp-backend:8081`，并同时支持域名根路径与 `/screen/` 子路径；部署编排中的后端服务如使用其他名称或地址，请调整 `nginx.conf`。Pilot 默认从同源 `/screen/` 打开大屏，部署网关应把该路径转发到 orp-screen 服务；独立域名部署可用 `VITE_ORP_SCREEN_URL` 覆盖 Pilot 构建配置。入口页按当前根路径或 `/screen/` 挂载前缀跳转，避免在子路径代理配置下自循环。
