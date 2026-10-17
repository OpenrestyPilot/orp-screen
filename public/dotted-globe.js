(function () {
  'use strict';
  var canvas = document.getElementById('globeCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var land = [];
  var geography = { points: [], centers: [], flows: [] };
  var rotation = -0.35;
  var dragging = false;
  var dragX = 0;
  var lastFrame = 0;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var lightScene = new URLSearchParams(location.search).get('scene') === 'globe-light';

  function polygonIntersections(rings, lat) {
    var hits = [];
    rings.forEach(function (ring) {
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var a = ring[j], b = ring[i];
        if (!a || !b || a.length < 2 || b.length < 2 || (a[1] > lat) === (b[1] > lat)) continue;
        hits.push(a[0] + (lat - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    });
    hits.sort(function (a, b) { return a - b; });
    return hits;
  }

  function makeLandDots(geo) {
    var result = [];
    var step = 1.65;
    (geo.features || []).forEach(function (feature) {
      var type = feature.geometry && feature.geometry.type;
      var polygons = !feature.geometry ? [] : type === 'Polygon' ? [feature.geometry.coordinates] : type === 'MultiPolygon' ? feature.geometry.coordinates : [];
      polygons.forEach(function (rings) {
        var all = rings.reduce(function (acc, ring) { return acc.concat(ring); }, []);
        var ys = all.map(function (point) { return point[1]; });
        var minLat = Math.max(-84, Math.min.apply(null, ys));
        var maxLat = Math.min(84, Math.max.apply(null, ys));
        var first = Math.ceil(minLat / step) * step;
        for (var lat = first; lat <= maxLat; lat += step) {
          var hits = polygonIntersections(rings, lat);
          var spacing = step / Math.max(0.32, Math.cos(lat * Math.PI / 180));
          for (var h = 0; h + 1 < hits.length; h += 2) {
            var start = Math.ceil(hits[h] / spacing) * spacing;
            for (var lon = start; lon < hits[h + 1]; lon += spacing) result.push([lon, lat]);
          }
        }
      });
    });
    return result;
  }

  function project(lon, lat, cx, cy, radius) {
    var lambda = lon * Math.PI / 180 + rotation;
    var phi = lat * Math.PI / 180;
    var x = Math.cos(phi) * Math.sin(lambda);
    var y = -Math.sin(phi);
    var z = Math.cos(phi) * Math.cos(lambda);
    return { x: cx + x * radius, y: cy + y * radius, z: z, visible: z > -0.06 };
  }

  function sizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  }

  function drawLightMap(now, w, h) {
    var mapWidth = Math.min(w * .94, h * 1.72);
    var mapHeight = mapWidth * .5;
    var mapX = (w - mapWidth) / 2;
    var mapY = (h - mapHeight) / 2 - 8;
    var projectFlat = function (coord) {
      return { x: mapX + (Number(coord[0]) + 180) / 360 * mapWidth, y: mapY + (84 - Number(coord[1])) / 168 * mapHeight };
    };
    var landGlow = ctx.createRadialGradient(w * .5, mapY + mapHeight * .56, 0, w * .5, mapY + mapHeight * .56, mapWidth * .52);
    landGlow.addColorStop(0, 'rgba(151,174,216,.30)'); landGlow.addColorStop(.68, 'rgba(151,174,216,.12)'); landGlow.addColorStop(1, 'rgba(151,174,216,0)');
    ctx.fillStyle = landGlow; ctx.fillRect(mapX, mapY - 14, mapWidth, mapHeight + 28);
    land.forEach(function (point) {
      var p = projectFlat(point);
      if (p.y < mapY || p.y > mapY + mapHeight) return;
      ctx.fillStyle = 'rgba(74,96,139,.72)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.08, 0, Math.PI * 2); ctx.fill();
    });

    var flows = (geography.flows || []).slice(0, 80);
    var labelPoints = [];
    flows.forEach(function (flow, index) {
      if (!flow.coords || flow.coords.length < 2) return;
      var a = projectFlat(flow.coords[0]);
      var b = projectFlat(flow.coords[1]);
      var lift = Math.min(72, mapHeight * .25) + (index % 5) * 5;
      var control = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift };
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(control.x, control.y, b.x, b.y);
      ctx.strokeStyle = index % 3 === 0 ? 'rgba(232,91,137,.72)' : 'rgba(119,139,220,.58)';
      ctx.lineWidth = 1.15; ctx.stroke();
      var progress = (now / 2300 + index * .19) % 1;
      var inverse = 1 - progress;
      var particleX = inverse * inverse * a.x + 2 * inverse * progress * control.x + progress * progress * b.x;
      var particleY = inverse * inverse * a.y + 2 * inverse * progress * control.y + progress * progress * b.y;
      ctx.beginPath(); ctx.arc(particleX, particleY, 5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(228,93,145,.14)'; ctx.fill();
      ctx.beginPath(); ctx.arc(particleX, particleY, 2.2, 0, Math.PI * 2); ctx.fillStyle = '#df648e'; ctx.fill();
      if (index < 12) {
        labelPoints.push({ p: a, name: flow.source, value: flow.requests, tone: index % 3 === 0 ? '#e8819e' : '#8195db' });
        labelPoints.push({ p: b, name: flow.center, value: flow.requests, tone: '#78b9ca' });
      }
    });

    (geography.points || []).forEach(function (point) {
      if (!point.coord || point.coord.length < 2) return;
      var p = projectFlat(point.coord);
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fillStyle = 'rgba(226,103,145,.13)'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fillStyle = '#e47396'; ctx.fill();
    });
    (geography.centers || []).forEach(function (center) {
      if (!center.coord || center.coord.length < 2) return;
      var p = projectFlat(center.coord);
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fillStyle = 'rgba(94,166,199,.14)'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.1, 0, Math.PI * 2); ctx.fillStyle = '#5eabc1'; ctx.fill();
    });

    labelPoints.slice(0, 12).forEach(function (item, index) {
      var text = String(item.name || '未知位置').slice(0, 18);
      var count = Number(item.value || 0);
      ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif';
      var width = Math.min(152, Math.max(72, ctx.measureText(text).width + 25 + (count ? String(count).length * 5 : 0)));
      var offset = index % 2 === 0 ? -12 : 8;
      var x = Math.max(5, Math.min(w - width - 5, item.p.x - width / 2));
      var y = Math.max(26, Math.min(h - 30, item.p.y + offset));
      ctx.fillStyle = 'rgba(255,255,255,.93)';
      ctx.strokeStyle = 'rgba(139,153,182,.24)'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.roundRect(x, y, width, 22, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = item.tone; ctx.beginPath(); ctx.roundRect(x + 4, y + 5, 13, 12, 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(index % 2 === 0 ? '源' : '中', x + 10.5, y + 14);
      ctx.textAlign = 'left'; ctx.fillStyle = '#3f4d64'; ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.fillText(text, x + 21, y + 14);
      if (count) { ctx.textAlign = 'right'; ctx.fillStyle = '#8c96a7'; ctx.fillText(String(count), x + width - 5, y + 14); ctx.textAlign = 'left'; }
    });

    var scanX = mapX + ((now % 8000) / 8000) * mapWidth;
    var scan = ctx.createLinearGradient(scanX - 32, 0, scanX + 32, 0);
    scan.addColorStop(0, 'rgba(105,139,205,0)'); scan.addColorStop(.5, 'rgba(105,139,205,.10)'); scan.addColorStop(1, 'rgba(105,139,205,0)');
    ctx.fillStyle = scan; ctx.fillRect(mapX, mapY, mapWidth, mapHeight);
    if (!flows.length && !(geography.points || []).length) {
      ctx.fillStyle = '#66758d'; ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('等待可定位的 GeoIP 请求 · 地图扫描动画不代表真实流量', w / 2, mapY + mapHeight + 36);
      ctx.textAlign = 'left';
    }
  }

  function draw(now) {
    requestAnimationFrame(draw);
    if (now - lastFrame < 32) return;
    lastFrame = now;
    sizeCanvas();
    var w = canvas.width / dpr, h = canvas.height / dpr;
    if (!w || !h) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (lightScene) { drawLightMap(now, w, h); return; }
    var radius = Math.min(w * 0.32, h * 0.39, 235);
    var cx = w * 0.5, cy = h * 0.51;
    var halo = ctx.createRadialGradient(cx, cy + radius * 0.12, radius * 0.7, cx, cy + radius * 0.12, radius * 1.34);
    halo.addColorStop(0, 'rgba(75,193,199,.15)'); halo.addColorStop(.55, 'rgba(98,199,205,.07)'); halo.addColorStop(1, 'rgba(98,199,205,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, radius * 1.38, 0, Math.PI * 2); ctx.fill();
    [1.18, 1.30, 1.43].forEach(function (scale, i) {
      ctx.beginPath(); ctx.arc(cx, cy, radius * scale, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(135,177,182,' + [0.13, 0.075, 0.035][i] + ')'; ctx.lineWidth = i === 0 ? 1 : 8; ctx.stroke();
    });
    var ocean = ctx.createRadialGradient(cx - radius * .42, cy - radius * .56, radius * .04, cx, cy, radius * 1.12);
    ocean.addColorStop(0, '#c9f5f1'); ocean.addColorStop(.5, '#8bdedb'); ocean.addColorStop(1, '#51c0c8');
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = ocean; ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.strokeStyle = 'rgba(241,255,255,.25)'; ctx.lineWidth = 1;
    [-.5, 0, .5].forEach(function (offset) { ctx.beginPath(); ctx.ellipse(cx, cy, radius * Math.sqrt(1 - offset * offset), radius * .20, 0, 0, Math.PI * 2); ctx.stroke(); });
    ctx.beginPath(); ctx.ellipse(cx, cy, radius * .37, radius, 0, 0, Math.PI * 2); ctx.stroke();
    land.forEach(function (point) {
      var p = project(point[0], point[1], cx, cy, radius);
      if (!p.visible) return;
      var light = Math.max(.42, Math.min(1, .76 + p.z * .22));
      ctx.fillStyle = 'rgba(255,255,255,' + light + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.z < .2 ? .65 : .9, 0, Math.PI * 2); ctx.fill();
    });
    // Business points and routes are only those returned by the GeoIP API.
    (geography.flows || []).forEach(function (flow, index) {
      if (!flow.coords || flow.coords.length < 2) return;
      var a = project(flow.coords[0][0], flow.coords[0][1], cx, cy, radius);
      var b = project(flow.coords[1][0], flow.coords[1][1], cx, cy, radius);
      if (!a.visible || !b.visible) return;
      var bend = Math.min(36, radius * .18) + (index % 5) * 3;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - bend, b.x, b.y);
      ctx.strokeStyle = 'rgba(21,151,169,.32)'; ctx.lineWidth = 1; ctx.stroke();
    });
    (geography.points || []).forEach(function (point) {
      if (!point.coord || point.coord.length < 2) return;
      var p = project(point.coord[0], point.coord[1], cx, cy, radius);
      if (!p.visible) return;
      var r = 2.1 + Math.min(4.5, Math.log(Number(point.requests || 1) + 1));
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(18,166,180,.12)'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = '#159cac'; ctx.fill();
    });
    (geography.centers || []).forEach(function (center) {
      if (!center.coord || center.coord.length < 2) return;
      var p = project(center.coord[0], center.coord[1], cx, cy, radius);
      if (!p.visible) return;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(245,176,73,.2)'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#e4a83c'; ctx.fill();
    });
    ctx.restore();
  }

  canvas.addEventListener('pointerdown', function (event) { dragging = true; dragX = event.clientX; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', function (event) { if (!dragging) return; rotation += (event.clientX - dragX) / 180; dragX = event.clientX; });
  canvas.addEventListener('pointerup', function () { dragging = false; });
  canvas.addEventListener('pointercancel', function () { dragging = false; });
  canvas.addEventListener('wheel', function (event) { rotation += event.deltaY * .001; }, { passive: true });
  window.__orpDottedGlobe = { update: function (data) { geography = data || geography; } };
  fetch('/maps/world.json').then(function (response) { if (!response.ok) throw new Error('world map HTTP ' + response.status); return response.json(); }).then(function (geo) { land = makeLandDots(geo); }).catch(function (error) { console.error('[orp-screen] dotted globe map failed', error); });
  requestAnimationFrame(draw);
})();
