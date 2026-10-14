# orp-screen

ORP 匿名实时大屏独立项目，携带世界、四川、成都地图的 2D/3D 资源，通过 `/api/public/screens/events` 接收 ORP 后端公开的实时 SSE 数据。

## 本地预览

需要 Python 3。先启动 ORP 后端，再运行：

```sh
python3 -m http.server 5173 --directory public
```

浏览器访问 `http://localhost:5173/?map=world&mode=2d`。`map` 支持 `world`、`sichuan`、`chengdu`；`mode` 支持 `2d`、`3d`。SSE 请求须通过同源反向代理转发到 ORP 后端，开发时可将 `/api/public/screens/` 代理到 `http://127.0.0.1:8081`。

## 构建与部署

构建仅依赖 Node.js 内置模块：

```sh
npm run build
```

产物位于 `dist/`。也可以直接构建容器：

```sh
docker build -t orp-screen:local .
```

容器默认监听 80 端口。Nginx 将匿名 SSE 代理到 `orp-backend:8081`；部署编排中的后端服务如使用其他名称或地址，请调整 `nginx.conf`。Pilot 默认从同源 `/screen/` 跳转至大屏，部署网关应把该路径代理到 orp-screen 服务；独立域名部署可用 `VITE_ORP_SCREEN_URL` 覆盖 Pilot 构建配置。
