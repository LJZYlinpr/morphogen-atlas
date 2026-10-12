import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (id) => document.getElementById(id);
const AXES = ['AP', 'u', 'w'];
const MODES = ['observed', 'fitted', 'gradient'];
const PALETTE = ['#2850a5', '#ffffff', '#bd2026'];
const COLORS = PALETTE.map((c) => new THREE.Color(c));
const ROOT = 'data/';

let meta, rows, rowIds, count, drawCount, positions, contextGeometry, pointSprite, referenceDistance;
let currentModule = null, moduleData = null, token = 0, ready = false, dirty = true, lastFrame = 0;
const panels = [];
const cache = new Map();

function file(name) {
  if (!name || name.includes('..') || name.startsWith('/')) throw new Error('bad file');
  return ROOT + name;
}

async function bytes(name) {
  const res = await fetch(file(name));
  if (!res.ok) throw new Error(`缺少文件 ${name} (${res.status})`);
  return res.arrayBuffer();
}

async function float32(name) { return new Float32Array(await bytes(name)); }

async function quantized(name, scale) {
  const raw = new Int16Array(await bytes(name));
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] === -32768 ? NaN : (raw[i] / 32767) * scale;
  return out;
}

function sprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 15, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(.65, 'rgba(255,255,255,.72)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function updateAppearance() {
  const base = Number($('pointSize').value);
  const automatic = $('autoSize').checked;
  const densityScale = automatic ? Math.pow(80000 / Math.max(drawCount, 1), .18) : 1;
  $('sizeOut').textContent = base.toFixed(1);
  for (const p of panels) {
    if (!p.points) continue;
    const distance = Math.max(p.camera.position.distanceTo(p.controls.target), 1);
    const zoom = automatic ? Math.sqrt(referenceDistance / distance) : 1;
    p.points.material.size = THREE.MathUtils.clamp(base * densityScale * zoom, .8, 4);
    p.points.material.opacity = Number($('opacity').value);
    p.context.visible = $('ctx').checked;
  }
  dirty = true;
}

function resize(p) {
  const rect = p.container.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  p.renderer.setSize(rect.width, rect.height, false);
  p.camera.aspect = rect.width / rect.height;
  p.camera.updateProjectionMatrix();
  dirty = true;
}

function panelFor(axis) {
  const container = $(`vp-${axis}`);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 400);
  camera.position.set(31, -33, 29);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  let syncing = false;
  controls.addEventListener('change', () => {
    dirty = true;
    if (syncing) return;
    syncing = true;
    for (const other of panels) {
      if (other.axis === axis) continue;
      other.camera.position.copy(camera.position);
      other.camera.quaternion.copy(camera.quaternion);
      other.camera.up.copy(camera.up);
      other.controls.target.copy(controls.target);
      other.controls.update();
    }
    syncing = false;
  });
  const panel = { axis, container, renderer, scene, camera, controls, values: null, visible: 0, selected: null };
  panel.context = new THREE.Points(contextGeometry, new THREE.PointsMaterial({
    color: '#a9b8c5', map: pointSprite, size: 1.8, sizeAttenuation: false,
    opacity: .08, transparent: true, depthWrite: false, depthTest: false,
  }));
  panel.context.renderOrder = -1;
  scene.add(panel.context);
  let down;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) pick(panel, e);
  });
  new ResizeObserver(() => resize(panel)).observe(container);
  return panel;
}

function rebuild() {
  drawCount = Math.min($('density').value === 'all' ? count : Number($('density').value), count);
  positions = new Float32Array(drawCount * 3);
  for (let i = 0; i < drawCount; i++) positions.set(rows.subarray(i * 8, i * 8 + 3), i * 3);
  for (const p of panels) {
    if (p.points) { p.scene.remove(p.points); p.points.geometry.dispose(); p.points.material.dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
    p.points = new THREE.Points(g, new THREE.PointsMaterial({
      map: pointSprite, size: 1.6, sizeAttenuation: false, vertexColors: true,
      transparent: true, opacity: .9, depthWrite: false, alphaTest: .01,
    }));
    p.points.renderOrder = 1;
    p.scene.add(p.points);
  }
  redraw();
}

function axisCoord(axis, base) {
  return axis === 'AP' ? rows[base + 3] : axis === 'u' ? rows[base + 4] : rows[base + 5];
}

function isVisible(p, i) {
  if (!p.values) return false;
  const value = p.values[$('mode').value][i];
  if (!Number.isFinite(value)) return false;
  const base = i * 8;
  if (rows[base + 6] !== Number($('zoneSelect').value)) return false;
  const w = rows[base + 5];
  return w >= Number($('wLow').value) && w <= Number($('wHigh').value);
}

function limitFor(axis, mode) {
  if (!meta.arrays[axis] || !currentModule) return 1;
  const entry = meta.arrays[axis][currentModule]?.[mode];
  if (!entry) return 1;
  if (mode !== 'gradient') {
    // Shared scale across AP/u/w for expression so the three panels are comparable.
    return Math.max(...AXES.map((a) => meta.arrays[a]?.[currentModule]?.[mode]?.scale || 0), 1e-6);
  }
  return entry.scale;
}

function redraw() {
  if (!meta) return;
  const mode = $('mode').value;
  for (const p of panels) {
    if (!p.points) continue;
    const ids = [];
    for (let i = 0; i < drawCount; i++) if (isVisible(p, i)) ids.push(i);
    const limit = limitFor(p.axis, mode);
    const pos = new Float32Array(ids.length * 3), col = new Float32Array(ids.length * 3);
    const c = new THREE.Color();
    ids.forEach((id, j) => {
      pos.set(positions.subarray(id * 3, id * 3 + 3), j * 3);
      const v = THREE.MathUtils.clamp(p.values[mode][id] / limit, -1, 1);
      if (v <= 0) c.copy(COLORS[0]).lerp(COLORS[1], v + 1);
      else c.copy(COLORS[1]).lerp(COLORS[2], v);
      col.set([c.r, c.g, c.b], j * 3);
    });
    p.points.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    p.points.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (ids.length) p.points.geometry.computeBoundingSphere();
    p.drawIds = ids;
    p.visible = ids.length;
    p.selected = null;
    $(`pk-${p.axis}`).textContent = '点选可见体素';
    const currentDetail = meta.modules.find((m) => Number(m.module) === Number(currentModule));
    $(`st-${p.axis}`).textContent = `${ids.length.toLocaleString()} 个展示体素 · 同一 ${currentDetail?.n_genes || '—'} 个基因`;
    $(`sc-${p.axis}`).innerHTML = [-limit, 0, limit].map((v) => `<span>${v.toFixed(3)}</span>`).join('');
  }
  updateAppearance();
}

function drawCurve(axis) {
  const svg = $(`cv-${axis}`);
  svg.replaceChildren(); svg.setAttribute('viewBox', '0 0 320 120');
  const curve = meta.curves[currentModule]?.[axis];
  if (!curve) return;
  const ns = 'http://www.w3.org/2000/svg';
  const lines = axis === 'u' ? [curve.left, curve.right] : [curve.y];
  const limit = Math.max(...lines.flat().map(Math.abs), .01);
  const zero = document.createElementNS(ns, 'path');
  zero.setAttribute('d', 'M 25 60 L 305 60'); zero.setAttribute('stroke', '#6e7d88'); svg.append(zero);
  lines.forEach((series, index) => {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', curve.x.map((x, i) => `${i ? 'L' : 'M'} ${25 + x * 280} ${60 - series[i] / limit * 44}`).join(' '));
    path.setAttribute('stroke', index === 0 ? PALETTE[0] : PALETTE[2]);
    path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', '2');
    svg.append(path);
  });
  for (const [x, text] of [[25, '0'], [150, '场坐标'], [285, '100']]) {
    const node = document.createElementNS(ns, 'text');
    node.setAttribute('x', x); node.setAttribute('y', 112); node.textContent = text; svg.append(node);
  }
}

async function loadModule(module) {
  if (cache.has(module)) { const v = cache.get(module); cache.delete(module); cache.set(module, v); return v; }
  const data = {};
  await Promise.all(AXES.map(async (axis) => {
    data[axis] = {};
    await Promise.all(MODES.map(async (mode) => {
      const entry = meta.arrays[axis][String(module)][mode];
      data[axis][mode] = await quantized(entry.file, entry.scale);
    }));
  }));
  cache.set(module, data);
  while (cache.size > 2) cache.delete(cache.keys().next().value);
  return data;
}

async function activate() {
  const mine = ++token; ready = false;
  const rawModule = $('moduleSelect').value || String(meta.modules[0]?.module || 1);
  const module = Number(rawModule);
  const detail = meta.modules.find((m) => Number(m.module) === module) || meta.modules[0];
  if (!detail) throw new Error('公开模块元数据为空');
  currentModule = module;
  $('statGenes').textContent = detail.n_genes;
  $('status').textContent = '正在载入三条轴的同一模块…';
  for (const p of panels) p.values = null;
  redraw();
  try {
    moduleData = await loadModule(module);
    if (mine !== token) return;
    for (const p of panels) p.values = moduleData[p.axis];
    AXES.forEach(drawCurve);
    const trend = detail.trend_text;
    $('infoTitle').textContent = `M${module} · 趋势说明（${detail.n_genes} 个基因）`;
    $('infoTrend').innerHTML = trend.map((t) => `<p class="trend"><b>${t.axis}</b>：${t.text}</p>`).join('');
    $('infoGenes').textContent = `代表基因：${detail.representatives.join('，')}。`;
    $('infoAll').textContent = detail.genes.join('，');
    ready = true; redraw();
    $('status').textContent = `M${module}：AP / u / w 三面板使用完全相同的 ${detail.n_genes} 个基因；拖动任一面板会同步旋转。`;
  } catch (error) {
    if (mine === token) { $('status').textContent = `载入失败：${error.message}`; }
    console.error(error);
  }
}

function pick(p, event) {
  if (!p.drawIds?.length) return;
  const rect = p.renderer.domElement.getBoundingClientRect();
  const ray = new THREE.Raycaster(); ray.params.Points.threshold = .2;
  ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), p.camera);
  const hit = ray.intersectObject(p.points)[0];
  if (!hit) return;
  const id = p.drawIds[hit.index];
  p.selected = id;
  $(`pk-${p.axis}`).textContent = `体素 ${rowIds[id].toLocaleString()} · ${$('mode').value}=${p.values[$('mode').value][id].toFixed(4)} · ${p.axis}=${axisCoord(p.axis, id * 8).toFixed(3)} · ${meta.zones[rows[id * 8 + 6]]} · ${rows[id * 8 + 7] === 0 ? '左' : '右'}`;
}

function reset() {
  for (const p of panels) { p.camera.position.set(31, -33, 29); p.camera.up.set(0, 1, 0); p.controls.target.set(0, 0, 0); p.controls.update(); }
  dirty = true;
}

function save() {
  updateAppearance();
  const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 720;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#0f1417'; ctx.fillRect(0, 0, 1800, 720);
  panels.forEach((p, i) => {
    p.renderer.render(p.scene, p.camera);
    ctx.drawImage(p.renderer.domElement, i * 600, 48, 600, 590);
    ctx.fillStyle = '#fff'; ctx.font = '22px system-ui'; ctx.fillText(p.axis, i * 600 + 20, 32);
  });
  ctx.fillStyle = '#cfe0e6'; ctx.font = '16px system-ui';
  ctx.fillText(`M${$('moduleSelect').value} · ${meta.zones[Number($('zoneSelect').value)]} · ${$('mode').value} · same gene set / blue-white-red`, 20, 680);
  const link = document.createElement('a');
  link.download = 'morphogen-atlas.png'; link.href = canvas.toDataURL('image/png'); link.click();
}

function loop(t) {
  requestAnimationFrame(loop);
  if (document.hidden || t - lastFrame < 33) return;
  lastFrame = t;
  panels.forEach((p) => p.controls.update());
  updateAppearance();
  if (dirty) { panels.forEach((p) => p.renderer.render(p.scene, p.camera)); dirty = false; }
}

async function start() {
  try {
    meta = JSON.parse(new TextDecoder().decode(await bytes('meta.json')));
    count = meta.count;
    [rows, rowIds] = await Promise.all([float32(meta.geometry), bytes(meta.rowIds).then((b) => new Uint32Array(b))]);
    if (rows.length !== count * 8 || rowIds.length !== count) throw new Error('几何与索引长度不一致');
    $('statPoints').textContent = count.toLocaleString();
    for (const m of meta.modules) {
      const o = document.createElement('option');
      o.value = m.module; o.textContent = `M${m.module} · ${m.n_genes} genes`; $('moduleSelect').append(o);
    }
    meta.zones.forEach((z, i) => { const o = document.createElement('option'); o.value = i; o.textContent = z; $('zoneSelect').append(o); });
    pointSprite = sprite();
    const bg = Math.min(count, 60000);
    const arr = new Float32Array(bg * 3);
    for (let i = 0; i < bg; i++) { const row = Math.floor(i * count / bg); arr.set(rows.subarray(row * 8, row * 8 + 3), i * 3); }
    contextGeometry = new THREE.BufferGeometry();
    contextGeometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    contextGeometry.computeBoundingSphere();
    referenceDistance = new THREE.Vector3(31, -33, 29).length();
    AXES.forEach((a) => panels.push(panelFor(a)));
    rebuild(); panels.forEach(resize); reset(); requestAnimationFrame(loop);
    for (const id of ['moduleSelect']) $(id).addEventListener('change', activate);
    for (const id of ['zoneSelect', 'mode', 'wLow', 'wHigh', 'opacity']) $(id).addEventListener('input', redraw);
    for (const id of ['pointSize', 'autoSize', 'ctx']) $(id).addEventListener('input', updateAppearance);
    $('density').addEventListener('change', rebuild);
    $('reset').addEventListener('click', reset);
    $('save').addEventListener('click', save);
    window.atlasDebug = () => ({ ready, module: currentModule, points: count, panels: panels.map((p) => ({ axis: p.axis, visible: p.visible })), palette: PALETTE, modes: MODES });
    await activate();
  } catch (error) {
    $('status').textContent = `初始化失败：${error.message}`;
    console.error(error);
  }
}

start();
