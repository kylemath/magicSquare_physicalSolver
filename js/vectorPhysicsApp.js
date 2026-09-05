import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const EULER_4 = [
  [16, 2, 3, 13],
  [5, 11, 10, 8],
  [9, 7, 6, 12],
  [4, 14, 15, 1],
];

const host = document.querySelector("#sceneHost");
const statsEl = document.querySelector("#stats");
const tableEl = document.querySelector("#squareTable");
const controls = {
  spinX: document.querySelector("#spinX"),
  spinY: document.querySelector("#spinY"),
  spinZ: document.querySelector("#spinZ"),
  heightScale: document.querySelector("#heightScale"),
  spring: document.querySelector("#spring"),
  damping: document.querySelector("#damping"),
  kick: document.querySelector("#kickButton"),
  reset: document.querySelector("#resetButton"),
  pause: document.querySelector("#pauseButton"),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090a);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(11, 10, 14);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
host.appendChild(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;

const light = new THREE.DirectionalLight(0xffffff, 2.4);
light.position.set(8, 10, 12);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.58));

const vectors = [];
const clock = new THREE.Clock();
const elapsed = { value: 0 };
let paused = false;
let frame = 0;

buildReferenceGeometry();
renderSquareTable();
buildVectorParticles();
resize();
animate();

window.addEventListener("resize", resize);
controls.kick.addEventListener("click", kickEndpoints);
controls.reset.addEventListener("click", resetSimulation);
controls.pause.addEventListener("click", () => {
  paused = !paused;
  controls.pause.textContent = paused ? "Resume" : "Pause";
});
controls.heightScale.addEventListener("input", () => {
  updateBaseVectors();
});

function buildReferenceGeometry() {
  const grid = new THREE.GridHelper(8, 4, 0x3b464c, 0x242b2f);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  const axes = new THREE.AxesHelper(5.2);
  scene.add(axes);

  addAxisLabel("X", new THREE.Vector3(5.6, 0, 0), 0x6daab8);
  addAxisLabel("Y", new THREE.Vector3(0, 5.6, 0), 0x8fb56a);
  addAxisLabel("Z", new THREE.Vector3(0, 0, 5.6), 0xd28a52);

  const originGeometry = new THREE.SphereGeometry(0.12, 24, 16);
  const originMaterial = new THREE.MeshStandardMaterial({ color: 0xedf0ea });
  scene.add(new THREE.Mesh(originGeometry, originMaterial));
}

function buildVectorParticles() {
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const value = EULER_4[row][col];
      const base = vectorFor(row, col, value);
      const shellRadius = base.length();
      const color = centeredHeight(value) >= 0 ? 0x6daab8 : 0xc86958;

      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(1, 36, 18),
        new THREE.MeshBasicMaterial({
          color,
          opacity: 0.035,
          transparent: true,
          wireframe: true,
        }),
      );
      shell.scale.setScalar(shellRadius);
      scene.add(shell);

      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(6), 3),
      );
      const line = new THREE.Line(
        lineGeometry,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.78 }),
      );
      scene.add(line);

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 20, 14),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.12,
          roughness: 0.55,
        }),
      );
      scene.add(sphere);

      const label = makeLabel(String(value), color);
      scene.add(label);

      vectors.push({
        row,
        col,
        value,
        base,
        shell,
        shellRadius,
        orbitAxis: orbitAxisFor(row, col, value),
        orbitSpeed: orbitSpeedFor(value, shellRadius),
        wobbleAxis: wobbleAxisFor(row, col, value),
        wobblePhase: (row * 4 + col) * 0.71,
        position: base.clone(),
        velocity: new THREE.Vector3(),
        lastVelocity: new THREE.Vector3(),
        line,
        sphere,
        label,
      });
    }
  }
  updateDrawables();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  if (!paused) stepPhysics(dt);
  orbit.update();
  renderer.render(scene, camera);
  frame += 1;
  if (frame % 8 === 0) renderStats();
}

function stepPhysics(dt) {
  elapsed.value += dt;
  const sharedDrift = angularVelocity().multiplyScalar(0.18);
  const shellStiffness = Number(controls.spring.value);
  const damping = Number(controls.damping.value);
  for (const vector of vectors) {
    const wobble = vector.wobbleAxis
      .clone()
      .multiplyScalar(0.22 * Math.sin(elapsed.value * 0.55 + vector.wobblePhase));
    const omega = vector.orbitAxis
      .clone()
      .multiplyScalar(vector.orbitSpeed)
      .add(wobble)
      .add(sharedDrift);
    const orbitVelocity = new THREE.Vector3().crossVectors(omega, vector.position);

    const radial = vector.position.clone().normalize();
    const radialError = vector.position.length() - vector.shellRadius;
    const radialVelocity = vector.velocity.dot(radial);
    vector.velocity.addScaledVector(radial, -shellStiffness * radialError * dt);
    vector.velocity.addScaledVector(radial, -damping * radialVelocity * dt);
    vector.velocity.addScaledVector(vector.velocity, -damping * 0.035 * dt);

    vector.position.addScaledVector(orbitVelocity, dt);
    vector.position.addScaledVector(vector.velocity, dt);

    const newRadius = vector.position.length();
    if (newRadius > 0) {
      const correction = Math.min(1, shellStiffness * dt * 0.08);
      vector.position.multiplyScalar(
        1 + ((vector.shellRadius / newRadius) - 1) * correction,
      );
    }
    vector.lastVelocity.copy(orbitVelocity).add(vector.velocity);
  }
  updateDrawables();
}

function updateDrawables() {
  for (const vector of vectors) {
    const position = vector.line.geometry.attributes.position;
    position.setXYZ(0, 0, 0, 0);
    position.setXYZ(1, vector.position.x, vector.position.y, vector.position.z);
    position.needsUpdate = true;
    vector.sphere.position.copy(vector.position);
    vector.label.position.copy(vector.position).multiplyScalar(1.06);
  }
}

function angularVelocity() {
  return new THREE.Vector3(
    Number(controls.spinX.value),
    Number(controls.spinY.value),
    Number(controls.spinZ.value),
  );
}

function updateBaseVectors() {
  for (const vector of vectors) {
    vector.base.copy(vectorFor(vector.row, vector.col, vector.value));
    const direction = vector.position.clone().normalize();
    vector.shellRadius = vector.base.length();
    vector.shell.scale.setScalar(vector.shellRadius);
    vector.position.copy(direction.multiplyScalar(vector.shellRadius));
    vector.orbitSpeed = orbitSpeedFor(vector.value, vector.shellRadius);
  }
}

function kickEndpoints() {
  for (const vector of vectors) {
    vector.velocity.add(
      new THREE.Vector3(
        randomCentered() * 2.2,
        randomCentered() * 2.2,
        randomCentered() * 2.2,
      ),
    );
  }
}

function resetSimulation() {
  elapsed.value = 0;
  for (const vector of vectors) {
    vector.position.copy(vector.base);
    vector.velocity.set(0, 0, 0);
    vector.lastVelocity.set(0, 0, 0);
  }
  updateDrawables();
  renderStats();
}

function vectorFor(row, col, value) {
  const x = 2 * col - 3;
  const y = -(2 * row - 3);
  const z = centeredHeight(value) * Number(controls.heightScale.value);
  return new THREE.Vector3(x, y, z);
}

function centeredHeight(value) {
  return 2 * value - 17;
}

function orbitAxisFor(row, col, value) {
  return new THREE.Vector3(
    Math.sin((row + 1) * 1.73 + value * 0.11),
    Math.cos((col + 1) * 1.29 - value * 0.07),
    Math.sin((row + col + 1) * 0.91 + value * 0.13),
  ).normalize();
}

function wobbleAxisFor(row, col, value) {
  return new THREE.Vector3(
    Math.cos((row + 1) * 0.67 + value * 0.19),
    Math.sin((col + 1) * 0.83 + value * 0.17),
    Math.cos((row - col + 2) * 1.11),
  ).normalize();
}

function orbitSpeedFor(value, radius) {
  const centered = Math.abs(centeredHeight(value));
  return 0.28 + centered / 18 + 0.8 / Math.max(radius, 0.5);
}

function renderSquareTable() {
  tableEl.innerHTML = EULER_4.flatMap((row) =>
    row.map((value) => {
      const z = centeredHeight(value);
      return `
        <div class="square-cell ${z >= 0 ? "positive" : "negative"}">
          <strong>${value}</strong>
          <span>Z=${z > 0 ? "+" : ""}${z}</span>
        </div>
      `;
    }),
  ).join("");
}

function renderStats() {
  const mean = vectors
    .reduce((acc, vector) => acc.add(vector.position), new THREE.Vector3())
    .multiplyScalar(1 / vectors.length);
  const kinetic = vectors.reduce(
    (sum, vector) => sum + 0.5 * vector.lastVelocity.lengthSq(),
    0,
  );
  const shellRms = Math.sqrt(
    vectors.reduce((sum, vector) => {
      const error = vector.position.length() - vector.shellRadius;
      return sum + error * error;
    }, 0) / vectors.length,
  );
  const residuals = lineResiduals();
  const maxResidual = Math.max(...residuals.map((value) => Math.abs(value)));
  const omega = angularVelocity();
  statsEl.innerHTML = [
    ["Mean endpoint", formatVector(mean)],
    ["Shared drift speed", omega.length().toFixed(3)],
    ["Kinetic energy", kinetic.toFixed(3)],
    ["Shell radius RMS error", shellRms.toFixed(4)],
    ["Max line residual", maxResidual.toFixed(0)],
    ["Centered height sum", centeredHeightSum().toFixed(0)],
  ]
    .map(
      ([label, value]) => `
        <div class="stat">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `,
    )
    .join("");
}

function lineResiduals() {
  const target = 34;
  const rows = EULER_4.map((row) => row.reduce((sum, value) => sum + value, 0) - target);
  const cols = Array.from({ length: 4 }, (_, col) =>
    EULER_4.reduce((sum, row) => sum + row[col], 0) - target,
  );
  const diags = [
    EULER_4.reduce((sum, row, index) => sum + row[index], 0) - target,
    EULER_4.reduce((sum, row, index) => sum + row[3 - index], 0) - target,
  ];
  return [...rows, ...cols, ...diags];
}

function centeredHeightSum() {
  return EULER_4.flat().reduce((sum, value) => sum + centeredHeight(value), 0);
}

function makeLabel(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(7, 9, 10, 0.78)";
  ctx.beginPath();
  ctx.arc(48, 48, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = "#edf0ea";
  ctx.font = "700 34px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 48, 50);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.48, 0.48, 0.48);
  return sprite;
}

function addAxisLabel(text, position, color) {
  const label = makeLabel(text, color);
  label.position.copy(position);
  label.scale.set(0.6, 0.6, 0.6);
  scene.add(label);
}

function resize() {
  const rect = host.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

function randomCentered() {
  return Math.random() - 0.5;
}

function formatVector(vector) {
  return `(${vector.x.toFixed(2)}, ${vector.y.toFixed(2)}, ${vector.z.toFixed(2)})`;
}
