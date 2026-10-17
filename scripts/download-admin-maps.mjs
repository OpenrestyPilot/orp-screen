import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('public/maps/admin');
const chinaApi = 'https://geojson.cn/api/china';
const aliyunUrl = (code) => `https://geo.datav.aliyun.com/areas_v3/bound/${code}_full.json`;
const concurrency = 4;
const municipalities = new Set(['110000', '120000', '310000', '500000']);

async function getJson(url, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'orp-screen-admin-map-builder/1.0' } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 600 * (i + 1)));
    }
  }
  throw new Error(`${url}: ${lastError}`);
}

async function readCachedMap(code) {
  try {
    const geo = JSON.parse(await readFile(path.join(output, `${code}.json`), 'utf8'));
    return Array.isArray(geo.features) && geo.features.length ? geo : null;
  } catch {
    return null;
  }
}

async function writeMap(code, geo) {
  await writeFile(path.join(output, `${code}.json`), `${JSON.stringify(geo)}\n`);
}

async function mapPool(items, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) await worker(items[cursor++]);
  }));
}

await mkdir(output, { recursive: true });
const national = await getJson(`${chinaApi}/100000.json`);
if (!Array.isArray(national.features) || national.features.length < 30) {
  throw new Error('National GeoJSON did not contain the expected province-level boundaries');
}
const provinceFeatures = national.features.filter((feature) => !String(feature.properties.fullname || feature.properties.name).includes('十段线'));
const provinces = provinceFeatures.map((feature) => ({
  code: String(feature.properties.code || feature.properties.adcode),
  name: feature.properties.fullname || feature.properties.name,
  level: 1,
  children: [],
}));
await writeMap('100000', { ...national, features: provinceFeatures });

await mapPool(provinces, async (province) => {
  let areas;
  try {
    areas = await getJson(`${chinaApi}/${province.code}.json`);
  } catch (error) {
    const outline = provinceFeatures.find((feature) => String(feature.properties.code || feature.properties.adcode) === province.code);
    if (!outline) throw error;
    areas = { type: 'FeatureCollection', features: [outline], properties: { name: province.name } };
  }
  await writeMap(province.code, areas);
  province.children = (areas.features || []).map((feature) => ({
    code: String(feature.properties.adcode || feature.properties.code),
    name: feature.properties.name || feature.properties.fullname,
    level: municipalities.has(province.code) ? 3 : 2,
    children: [],
  })).filter((child) => child.code !== province.code);
  if (municipalities.has(province.code)) {
    for (const feature of areas.features || []) {
      const code = String(feature.properties.adcode || feature.properties.code);
      if (code !== province.code) await writeMap(code, { type: 'FeatureCollection', features: [feature], properties: { name: feature.properties.name } });
    }
  }
  process.stdout.write(`省级完成 ${province.name} ${province.children.length} 个下级区域\n`);
});

const cities = provinces.flatMap((province) => province.children.filter((child) => child.level === 2).map((city) => {
  city.parentCode = province.code;
  return city;
}));
const unresolvedCities = [];
await mapPool(cities, async (city) => {
  let districts = await readCachedMap(city.code);
  if (!districts) {
    try {
      districts = await getJson(aliyunUrl(city.code));
    } catch {
      unresolvedCities.push(city);
      return;
    }
  }
  await writeMap(city.code, districts);
  city.children = (districts.features || []).map((feature) => ({
    code: String(feature.properties.adcode || feature.properties.code),
    name: feature.properties.name || feature.properties.fullname,
    level: 3,
    children: [],
  })).filter((child) => child.code !== city.code);
  for (const feature of districts.features || []) {
    const districtCode = String(feature.properties.adcode || feature.properties.code);
    if (districtCode !== city.code) await writeMap(districtCode, { type: 'FeatureCollection', features: [feature], properties: { name: feature.properties.name } });
  }
  process.stdout.write(`市级完成 ${city.name} ${city.children.length} 个区县\n`);
});

for (const city of unresolvedCities) {
  const provinceAreas = await readCachedMap(city.parentCode);
  const outline = provinceAreas?.features?.find((feature) => String(feature.properties.adcode || feature.properties.code) === city.code);
  if (!outline) throw new Error(`No usable city outline was found for ${city.code} ${city.name}`);
  await writeMap(city.code, { type: 'FeatureCollection', features: [outline], properties: { name: city.name } });
  process.stdout.write(`区县边界缺失，保留 ${city.name} 本级轮廓\n`);
}

const manifest = {
  source: {
    provincesAndCities: 'https://geojson.cn/data/atlas/china',
    districts: 'https://geo.datav.aliyun.com/areas_v3/bound/{adcode}_full.json',
    downloadedAt: new Date().toISOString(),
  },
  code: '100000',
  name: '中国',
  level: 0,
  children: provinces,
};
await writeFile(path.join(output, 'index.json'), `${JSON.stringify(manifest)}\n`);
const validCodes = new Set(['100000', ...provinces.map((area) => area.code), ...provinces.flatMap((province) => province.children.map((area) => area.code)), ...cities.flatMap((city) => city.children.map((area) => area.code))]);
for (const filename of await readdir(output)) {
  if (!filename.endsWith('.json') || filename === 'index.json') continue;
  if (!validCodes.has(filename.slice(0, -5))) await unlink(path.join(output, filename));
}
const districtCount = cities.reduce((total, city) => total + city.children.length, 0);
process.stdout.write(`全国行政区边界完成：${provinces.length} 省级、${cities.length} 市级、${districtCount} 区县级区域\n`);
