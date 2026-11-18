// Web version of plot_imu_display.py
// Three IMU modules driven by quaternions "Q1[w,x,y,z] Q2[w,x,y,z] Q3[w,x,y,z]" received over
// Web Bluetooth (Nordic UART) or Web Serial. Same scene as the PyQt/pyqtgraph version (Z axis up).
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { OBJLoader } from "three/addons/OBJLoader.js";

// ------------------------------------------------------------------ settings (same as the Python version)
const MODEL_URL = "assets/UT-module-brush.obj";
const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX_CHAR = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";   // CHAR_UUID in the Python code

const MESH_OFFSET = 5;                       // mesh2 at +X, mesh3 at -X
const COLOR_MESH1 = [1.0, 0.0, 0.0];         // red   (driven by Q3)
const COLOR_MESH2 = [0.12, 0.31, 0.85];      // blue  (driven by Q2)
const COLOR_MESH3 = [0.2, 0.79, 0.42];       // green (driven by Q1)

const ANCHOR_M1_TO_2 = new THREE.Vector3(1.3, 0, 0);    // side of mesh1 facing mesh2
const ANCHOR_M1_TO_3 = new THREE.Vector3(-1.3, 0, 0);   // side of mesh1 facing mesh3
const ANCHOR_M2 = new THREE.Vector3(3.7, 0, 0);         // side of mesh2 facing mesh1
const ANCHOR_M3 = new THREE.Vector3(-3.7, 0, 0);        // side of mesh3 facing mesh1

const JOINT_BULGE_SCALE = -0.6;   // larger |value| = more curved joint; positive = bends with the kink, negative = reversed
const JOINT_CURVE_POINTS = 40;
const JOINT_TUBE_RADIUS = 0.16;
const JOINT_TUBE_SIDES = 8;
const JOINT_OVAL_RADIUS_PERP = 0.25;
const JOINT_OVAL_RADIUS_ALONG = 0.35;
const JOINT_COLOR = new THREE.Color(0.9, 0.9, 0.67);

const COMPASS_HEADING_SIGN = -1.0;
const HEADING_FORWARD_AXIS = new THREE.Vector3(1, 0, 0);
const HEADING_MIN_HORIZ_LEN = 0.15;

// pyqtgraph setCameraPosition(distance=35, azimuth=-90, elevation=60)
const CAM_DISTANCE = 35, CAM_AZIMUTH = -90, CAM_ELEVATION = 60;

// ------------------------------------------------------------------ DOM
const $ = (id) => document.getElementById(id);
const ui = {
  connType: $("connType"), bleOpts: $("bleOpts"), serialOpts: $("serialOpts"),
  bleName: $("bleName"), baud: $("baud"),
  btnConnect: $("btnConnect"), btnDisconnect: $("btnDisconnect"), btnResetView: $("btnResetView"),
  status: $("status"), support: $("support"), rate: $("rate"), heading: $("heading"),
  quatRows: document.querySelectorAll(".quats tbody tr"), lastLine: $("lastLine"),
  view: $("view"), loading: $("loading"),
};

// ------------------------------------------------------------------ scene
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);   // Z up, like pyqtgraph

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x000000);
ui.view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

function resetView() {
  const az = THREE.MathUtils.degToRad(CAM_AZIMUTH), el = THREE.MathUtils.degToRad(CAM_ELEVATION);
  camera.position.set(
    CAM_DISTANCE * Math.cos(el) * Math.cos(az),
    CAM_DISTANCE * Math.cos(el) * Math.sin(az),
    CAM_DISTANCE * Math.sin(el));
  controls.target.set(0, 0, 0);
  controls.update();
}
resetView();

scene.add(new THREE.AmbientLight(0xffffff, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(1, 1, 1);
scene.add(sun);

// Grid + compass labels: rotate together with the heading of mesh1
const compass = new THREE.Group();
scene.add(compass);
const grid = new THREE.GridHelper(20, 20, 0x8a8a8a, 0x5a5a5a);
grid.rotation.x = Math.PI / 2;   // GridHelper lies in XZ -> put it in XY
compass.add(grid);

function makeLabel(text, x, y, z) {
  const fontPx = 64, pad = 20;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  ctx.font = `${fontPx}px Arial, sans-serif`;
  c.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  c.height = fontPx + pad * 2;
  ctx.font = `${fontPx}px Arial, sans-serif`;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const scale = 1 / 55;   // canvas px -> world units
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(c.width * scale, c.height * scale),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  plane.position.set(x, y, z);   // lies flat in the XY plane, readable from above (like the GL quads)
  return plane;
}
compass.add(makeLabel("North", 0, 11.5, 3));
compass.add(makeLabel("East", 11.5, 0, 3));
compass.add(makeLabel("South", 0, -11.5, 3));
compass.add(makeLabel("West", -11.5, 0, 3));

// Axis lines of mesh1 (X points to -X like the original, Y, Z), rotate with mesh1
const axes = new THREE.Group();
scene.add(axes);
function axisBar(dir, color) {
  const len = 2;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 12),
                           new THREE.MeshBasicMaterial({ color }));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  m.position.copy(dir).multiplyScalar(len / 2);
  axes.add(m);
}
axisBar(new THREE.Vector3(-1, 0, 0), 0xff0000);
axisBar(new THREE.Vector3(0, 1, 0), 0x00ff00);
axisBar(new THREE.Vector3(0, 0, 1), 0x0000ff);

// Modules (filled in after the OBJ is loaded). Each mesh rotates around the world origin, as in the Python code.
const meshes = { m1: null, m2: null, m3: null };
const rot = { m1: new THREE.Quaternion(), m2: new THREE.Quaternion(), m3: new THREE.Quaternion() };

function moduleMaterial(rgb) {
  return new THREE.MeshPhongMaterial({
    color: new THREE.Color(rgb[0] * 0.6, rgb[1] * 0.6, rgb[2] * 0.6),
    specular: 0x444444, shininess: 20, side: THREE.DoubleSide,
  });
}

async function loadModel() {
  const obj = await new OBJLoader().loadAsync(MODEL_URL);
  const geos = [];
  obj.traverse((o) => { if (o.isMesh) geos.push(o.geometry); });
  const base = geos[0];
  if (!base.attributes.normal) base.computeVertexNormals();

  const make = (offsetX, rgb) => {
    const g = base.clone();
    g.translate(offsetX, 0, 0);
    const m = new THREE.Mesh(g, moduleMaterial(rgb));
    scene.add(m);
    return m;
  };
  meshes.m1 = make(0, COLOR_MESH1);
  meshes.m2 = make(MESH_OFFSET, COLOR_MESH2);
  meshes.m3 = make(-MESH_OFFSET, COLOR_MESH3);
  ui.loading.remove();
}

// Joints: tube along a quadratic Bezier + an ellipsoid at its middle
const jointMat = new THREE.MeshPhongMaterial({
  color: JOINT_COLOR, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
});
const ovalGeo = new THREE.SphereGeometry(1, 16, 10);
ovalGeo.scale(JOINT_OVAL_RADIUS_PERP, JOINT_OVAL_RADIUS_ALONG, JOINT_OVAL_RADIUS_PERP);   // long axis = local Y

function makeJoint() {
  const tube = new THREE.Mesh(new THREE.BufferGeometry(), jointMat);
  const oval = new THREE.Mesh(ovalGeo, jointMat);
  scene.add(tube, oval);
  return { tube, oval };
}
const joint12 = makeJoint();
const joint13 = makeJoint();

const _yUp = new THREE.Vector3(0, 1, 0);
function updateJoint(joint, anchorA, anchorB, qA, qB) {
  const p1 = anchorA.clone().applyQuaternion(qA);
  const p2Straight = anchorB.clone().applyQuaternion(qA);   // where mesh B would be if it were straight
  const p2 = anchorB.clone().applyQuaternion(qB);           // where mesh B really is
  const deviation = p2.clone().sub(p2Straight);             // only the relative bend, zero when straight
  const control = p1.clone().add(p2).multiplyScalar(0.5).addScaledVector(deviation, JOINT_BULGE_SCALE);
  const curve = new THREE.QuadraticBezierCurve3(p1, control, p2);

  joint.tube.geometry.dispose();
  joint.tube.geometry = new THREE.TubeGeometry(curve, JOINT_CURVE_POINTS - 1, JOINT_TUBE_RADIUS, JOINT_TUBE_SIDES, false);

  const tMid = Math.floor(JOINT_CURVE_POINTS / 2) / (JOINT_CURVE_POINTS - 1);
  joint.oval.position.copy(curve.getPoint(tMid));
  const tangent = curve.getTangent(tMid);
  if (tangent.lengthSq() < 1e-12) tangent.set(1, 0, 0);
  joint.oval.quaternion.setFromUnitVectors(_yUp, tangent.normalize());
}

let lastHeadingDeg = null;
function updateCompassHeading() {
  const fwd = HEADING_FORWARD_AXIS.clone().applyQuaternion(rot.m1);
  if (Math.hypot(fwd.x, fwd.y) < HEADING_MIN_HORIZ_LEN) return;   // forward axis almost vertical: keep the last heading
  const yaw = Math.atan2(fwd.y, fwd.x) * COMPASS_HEADING_SIGN;
  compass.rotation.set(0, 0, yaw);
  lastHeadingDeg = ((THREE.MathUtils.radToDeg(-yaw) % 360) + 360) % 360;
}

let sceneDirty = true;
function applyPose() {
  for (const k of ["m1", "m2", "m3"]) if (meshes[k]) meshes[k].quaternion.copy(rot[k]);
  axes.quaternion.copy(rot.m1);
  updateCompassHeading();
  updateJoint(joint12, ANCHOR_M1_TO_2, ANCHOR_M2, rot.m1, rot.m2);
  updateJoint(joint13, ANCHOR_M1_TO_3, ANCHOR_M3, rot.m1, rot.m3);
}
applyPose();

// ------------------------------------------------------------------ data parsing
const PACKET_RE = /Q1\[([^\]]*)\]\s*Q2\[([^\]]*)\]\s*Q3\[([^\]]*)\]/g;
let rxBuf = "";
let latest = null;            // newest packet, applied once per animation frame
let packetCount = 0;

function parseQuat(s) {
  const v = s.split(",").map(Number);
  return v.length === 4 && v.every(Number.isFinite) ? v : null;
}

// Accepts any chunk of text (BLE notification or serial data); handles packets split across chunks.
function feed(text) {
  rxBuf += text;
  let m, lastEnd = -1;
  PACKET_RE.lastIndex = 0;
  while ((m = PACKET_RE.exec(rxBuf)) !== null) {
    const q1 = parseQuat(m[1]), q2 = parseQuat(m[2]), q3 = parseQuat(m[3]);
    if (q1 && q2 && q3) {
      latest = { q1, q2, q3, line: m[0] };
      packetCount++;
    }
    lastEnd = PACKET_RE.lastIndex;
  }
  if (lastEnd >= 0) rxBuf = rxBuf.slice(lastEnd);
  if (rxBuf.length > 4096) rxBuf = rxBuf.slice(-512);   // garbage without packets
}

function toQuat([w, x, y, z]) {
  const q = new THREE.Quaternion(x, y, z, w);
  return q.lengthSq() > 1e-12 ? q.normalize() : q.identity();
}

function consumeLatest() {
  if (!latest) return;
  const { q1, q2, q3, line } = latest;
  latest = null;
  rot.m2.copy(toQuat(q2));   // same mapping as the Python version
  rot.m1.copy(toQuat(q3));
  rot.m3.copy(toQuat(q1));
  applyPose();
  sceneDirty = true;

  [q1, q2, q3].forEach((q, i) => {
    ui.quatRows[i].querySelectorAll("td").forEach((td, j) => { td.textContent = q[j].toFixed(3); });
  });
  ui.lastLine.textContent = line;
  ui.heading.textContent = lastHeadingDeg === null ? "–" : `${lastHeadingDeg.toFixed(1)}°`;
}

setInterval(() => {
  ui.rate.textContent = connection ? `${packetCount} packets/s` : "–";
  packetCount = 0;
}, 1000);

// ------------------------------------------------------------------ connections
let connection = null;   // { type, close() }

function setStatus(text, kind = "") {
  ui.status.textContent = text;
  ui.status.className = "status" + (kind ? " " + kind : "");
}

function setConnectedUi(on) {
  ui.btnConnect.hidden = on;
  ui.btnDisconnect.hidden = !on;
  ui.connType.disabled = on;
  ui.bleName.disabled = on;
  ui.baud.disabled = on;
}

function onConnectionLost(reason) {
  if (!connection) return;
  connection = null;
  setConnectedUi(false);
  setStatus(reason || "Disconnected", reason ? "err" : "");
}

async function connectBle() {
  const name = ui.bleName.value.trim();
  const options = name
    ? { filters: [{ name }], optionalServices: [NUS_SERVICE] }
    : { acceptAllDevices: true, optionalServices: [NUS_SERVICE] };
  setStatus("Choose the device in the browser dialog…");
  const device = await navigator.bluetooth.requestDevice(options);
  setStatus(`Connecting to ${device.name || device.id}…`);
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(NUS_SERVICE);
  const ch = await service.getCharacteristic(NUS_TX_CHAR);
  const decoder = new TextDecoder();
  ch.addEventListener("characteristicvaluechanged", (e) => feed(decoder.decode(e.target.value, { stream: true })));
  await ch.startNotifications();
  device.addEventListener("gattserverdisconnected", () => onConnectionLost("Connection lost"));
  return {
    type: "ble",
    label: device.name || device.id,
    async close() {
      connection = null;
      try { await ch.stopNotifications(); } catch { /* already gone */ }
      if (device.gatt.connected) device.gatt.disconnect();
    },
  };
}

async function connectSerial() {
  setStatus("Choose the port in the browser dialog…");
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: Number(ui.baud.value) });
  const decoder = new TextDecoderStream();
  const pipeDone = port.readable.pipeTo(decoder.writable).catch(() => {});
  const reader = decoder.readable.getReader();
  let closing = false;

  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        feed(value);
      }
    } catch (e) {
      if (!closing) onConnectionLost(`Serial error: ${e.message}`);
    }
    if (!closing) onConnectionLost("Serial port closed");
  })();

  const info = port.getInfo();
  return {
    type: "serial",
    label: info.usbVendorId ? `USB ${info.usbVendorId.toString(16)}:${info.usbProductId.toString(16)}` : "serial port",
    async close() {
      closing = true;
      connection = null;
      try { await reader.cancel(); } catch { /* ignore */ }
      await pipeDone;
      try { await port.close(); } catch { /* ignore */ }
    },
  };
}

// Simulated data in the same text format, to try the page without hardware
function connectDemo() {
  const t0 = performance.now();
  const qAxis = (ax, ay, az, ang) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(ax, ay, az), ang);
  const fmt = (q) => [q.w, q.x, q.y, q.z].map((v) => v.toFixed(4)).join(",");
  const timer = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    const body = qAxis(0, 0, 1, 0.9 * Math.sin(0.25 * t)).multiply(qAxis(0, 1, 0, 0.25 * Math.sin(0.6 * t)));
    const q3 = body;                                                                        // mesh1 (center)
    const q2 = body.clone().multiply(qAxis(0, 0, 1, 0.5 * Math.sin(0.7 * t)));              // mesh2 bends
    const q1 = body.clone().multiply(qAxis(0, 1, 0, 0.45 * Math.sin(0.5 * t + 1)));         // mesh3 bends
    feed(`Q1[${fmt(q1)}] Q2[${fmt(q2)}] Q3[${fmt(q3)}]\n`);
  }, 20);
  return { type: "demo", label: "demo data", async close() { connection = null; clearInterval(timer); } };
}

async function connect() {
  ui.btnConnect.disabled = true;
  try {
    const type = ui.connType.value;
    connection = type === "ble" ? await connectBle() : type === "serial" ? await connectSerial() : connectDemo();
    rxBuf = "";
    setConnectedUi(true);
    setStatus(`Connected: ${connection.label}`, "ok");
  } catch (e) {
    connection = null;
    const cancelled = e && (e.name === "NotFoundError" || e.name === "AbortError");
    setStatus(cancelled ? "Not connected (no device selected)" : `Failed to connect: ${e.message || e}`, cancelled ? "" : "err");
  } finally {
    ui.btnConnect.disabled = false;
  }
}

async function disconnect() {
  const c = connection;
  if (c) await c.close();
  setConnectedUi(false);
  setStatus("Disconnected");
}

// ------------------------------------------------------------------ browser support
function updateSupport() {
  const type = ui.connType.value;
  ui.bleOpts.hidden = type !== "ble";
  ui.serialOpts.hidden = type !== "serial";
  let msg = "";
  if (!window.isSecureContext && type !== "demo") {
    msg = "Bluetooth / Serial need a secure page: open it via http://localhost or https://, not file://.";
  } else if (type === "ble" && !navigator.bluetooth) {
    msg = "This browser has no Web Bluetooth. Use Chrome or Edge (Windows, macOS, Linux, Android). "
        + "On Linux you may need to enable chrome://flags/#enable-experimental-web-platform-features.";
  } else if (type === "serial" && !navigator.serial) {
    msg = "This browser has no Web Serial. Use Chrome or Edge on a desktop computer.";
  }
  ui.support.textContent = msg;
  ui.support.hidden = !msg;
  ui.btnConnect.disabled = !!msg;
}

ui.connType.addEventListener("change", updateSupport);
ui.btnConnect.addEventListener("click", connect);
ui.btnDisconnect.addEventListener("click", disconnect);
ui.btnResetView.addEventListener("click", () => { resetView(); sceneDirty = true; });
controls.addEventListener("change", () => { sceneDirty = true; });
window.addEventListener("beforeunload", () => { if (connection) connection.close(); });
updateSupport();
if (new URLSearchParams(location.search).has("demo")) {   // index.html?demo -> start the simulation directly
  ui.connType.value = "demo";
  updateSupport();
  connect();
}

// ------------------------------------------------------------------ render loop
function resize() {
  const w = ui.view.clientWidth, h = ui.view.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  sceneDirty = true;
}
new ResizeObserver(resize).observe(ui.view);
resize();

function frame() {
  consumeLatest();
  controls.update();
  if (sceneDirty) {
    renderer.render(scene, camera);
    sceneDirty = false;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

loadModel()
  .then(() => { sceneDirty = true; })
  .catch((e) => {
    ui.loading.textContent = `Could not load the 3D model (${MODEL_URL}): ${e.message}. `
      + "Open the page through a web server (see README.md), not by double-clicking index.html.";
  });
