// 로비 1번 섬 3D 모델 — 외부 모델 파일 없이 코드로 만든 둥근 저폴리 모델이다(동물의 숲 분위기).
// 나중에 glb 모델을 받으면 Build*() 함수 안만 교체하면 된다.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { POP_FONT_FAMILY } from "../config";
import {
  ISLAND_RADIUS,
  LOBBY_BRIDGES,
  LOBBY_PLACES,
  TICKET_BOOTH_OBSTACLES,
  TICKET_GATE,
  type LobbyPlace,
} from "./lobbyPlaces";

export interface WorldObstacle {
  x: number;
  z: number;
  radius: number;
}

export interface IslandOneModel {
  root: THREE.Group;
  // place id → 건물 묶음 (터치 판정용)
  place_groups: Map<string, THREE.Group>;
  gate_arms: THREE.Group[];
  water: THREE.Mesh;
  clouds: THREE.Group[];
  // 분수 오리 부리에서 나오는 물줄기 (매 프레임 UpdateFountainJet)
  fountain_jets: FountainJet[];
  // 꼬마 바이킹 (배치표에 없으면 null)
  viking: VikingModel | null;
  obstacles: WorldObstacle[];
}

const COLOR = {
  grass: 0x8fd16f,
  grass_side: 0xb98b5b,
  sand: 0xf6e3b4,
  path: 0xf0d9a4,
  water: 0x6fd3e8,
  wood: 0xb5835a,
  wood_dark: 0x8a5f3f,
  cream: 0xfff4dc,
  white: 0xffffff,
  leaf: 0x5fbd6b,
  leaf_dark: 0x46a35e,
  yellow: 0xffd24c,
  orange: 0xff9a3c,
  pink: 0xffa6c1,
  blue: 0x7ccdf2,
  red: 0xf0705f,
  green: 0x3f9e6e,
  stone: 0xd8d3c7,
} as const;

const material_cache = new Map<number, THREE.MeshLambertMaterial>();

function Mat(color: number): THREE.MeshLambertMaterial {
  let material = material_cache.get(color);
  if (!material) {
    material = new THREE.MeshLambertMaterial({ color });
    material_cache.set(color, material);
  }
  return material;
}

// LobbyWorld 가 렌더러와 함께 지운 재질을 다음 로비에서 다시 쓰지 않도록 캐시를 비운다.
export function ClearIslandMaterialCache(): void {
  material_cache.clear();
}

function AddMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  color: number,
  x: number,
  y: number,
  z: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, Mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function Sphere(radius: number): THREE.SphereGeometry {
  return new THREE.SphereGeometry(radius, 16, 12);
}

function Box(width: number, height: number, depth: number, radius = 0.15): THREE.BufferGeometry {
  return new RoundedBoxGeometry(width, height, depth, 2, Math.min(radius, width / 2, height / 2, depth / 2));
}

function Cylinder(top: number, bottom: number, height: number, segments = 20): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(top, bottom, height, segments);
}

// 글자를 그린 간판. 앞면(+z)으로 보인다.
function CreateSign(text: string, width: number, height: number, background: string, foreground: string): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = Math.round((512 * height) / width);
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = background;
    context.beginPath();
    context.roundRect(0, 0, canvas.width, canvas.height, 36);
    context.fill();
    context.fillStyle = foreground;
    context.textAlign = "center";
    context.textBaseline = "middle";
    let font_size = Math.floor(canvas.height * 0.62);
    context.font = `${font_size}px "${POP_FONT_FAMILY}"`;
    while (context.measureText(text).width > canvas.width - 48 && font_size > 16) {
      font_size -= 2;
      context.font = `${font_size}px "${POP_FONT_FAMILY}"`;
    }
    context.fillText(text, canvas.width / 2, canvas.height / 2 + font_size * 0.05);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  // 반투명으로 두면 오리·별명과 그리는 순서가 바뀌며 깜빡인다 — 둥근 모서리만 잘라 내고 불투명으로 그린다.
  const material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5 });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

// 줄무늬 차양 — 건물 앞에 달린다.
function AddStripedAwning(parent: THREE.Object3D, width: number, z: number, y: number, color_a: number, color_b: number): void {
  const stripe_count = 6;
  const stripe_width = width / stripe_count;
  for (let i = 0; i < stripe_count; i++) {
    const stripe = AddMesh(parent, Box(stripe_width, 0.14, 1.5, 0.05), i % 2 === 0 ? color_a : color_b, -width / 2 + stripe_width * (i + 0.5), y, z);
    stripe.rotation.x = 0.42;
  }
}

// 둥근 벽 + 뾰족 지붕의 기본 건물. 앞(+z)에 문과 창문이 있고, 간판은 지붕 처마 아래에 붙는다.
function BuildRoundHouse(label: string, wall: number, roof: number, radius: number, sign_color: string): THREE.Group {
  const group = new THREE.Group();
  AddMesh(group, Cylinder(radius, radius * 1.04, 3.6), wall, 0, 1.8, 0);
  AddMesh(group, Cylinder(0.25, radius * 1.3, 2.6), roof, 0, 4.9, 0);
  AddMesh(group, Sphere(0.42), COLOR.yellow, 0, 6.3, 0);
  AddMesh(group, Box(1.5, 2.3, 0.3), COLOR.wood_dark, 0, 1.15, radius - 0.02);
  AddMesh(group, Sphere(0.1), COLOR.yellow, 0.48, 1.15, radius + 0.17);
  for (const side of [-1, 1]) {
    AddMesh(group, Box(1.05, 1.05, 0.25), COLOR.blue, side * 1.75, 1.95, radius - 0.42);
  }
  const sign = CreateSign(label, Math.min(radius * 1.55, 6.4), 1.15, sign_color, "#ffffff");
  sign.position.set(0, 3.2, radius + 0.42);
  group.add(sign);
  return group;
}

function BuildCafe(label: string, wall: number, roof: number, awning: number, sign_color: string): THREE.Group {
  const group = BuildRoundHouse(label, wall, roof, 4.1, sign_color);
  AddStripedAwning(group, 4.8, 4.75, 2.55, awning, COLOR.white);
  // 앞 테라스 파라솔과 테이블
  for (const side of [-1, 1]) {
    AddMesh(group, Cylinder(0.06, 0.06, 1.9, 8), COLOR.wood, side * 3.2, 0.95, 5.2);
    AddMesh(group, Cylinder(0.05, 1.05, 0.55, 12), awning, side * 3.2, 2, 5.2);
    AddMesh(group, Cylinder(0.5, 0.5, 0.1, 12), COLOR.cream, side * 3.2, 0.72, 5.2);
  }
  return group;
}

function BuildDollShop(label: string): THREE.Group {
  const group = BuildRoundHouse(label, COLOR.cream, COLOR.pink, 4.3, "#ef7ea3");
  // 입구 옆에 앉아 있는 곰 인형들
  for (const [x, color] of [[-2.9, 0xd9a26e], [2.9, 0xf7c4d4]] as const) {
    AddMesh(group, Sphere(0.72), color, x, 0.75, 5);
    AddMesh(group, Sphere(0.55), color, x, 1.72, 5);
    AddMesh(group, Sphere(0.2), color, x - 0.38, 2.15, 5);
    AddMesh(group, Sphere(0.2), color, x + 0.38, 2.15, 5);
    AddMesh(group, Sphere(0.13), COLOR.wood_dark, x, 1.62, 5.5);
  }
  return group;
}

function BuildToyShop(label: string): THREE.Group {
  const group = BuildRoundHouse(label, 0xcdeef6, COLOR.orange, 4.3, "#f28b3c");
  // 입구 옆에 쌓은 장난감 블록과 공
  const block_colors = [COLOR.red, COLOR.yellow, COLOR.blue, COLOR.leaf];
  block_colors.forEach((color, index) => {
    AddMesh(group, Box(0.8, 0.8, 0.8, 0.12), color, -3.1 + (index % 2) * 0.9, 0.42 + Math.floor(index / 2) * 0.82, 5);
  });
  AddMesh(group, Sphere(0.8), COLOR.red, 3, 0.82, 5);
  return group;
}

function BuildFoodTruck(label: string): THREE.Group {
  const group = new THREE.Group();
  AddMesh(group, Box(6, 3, 3, 0.5), COLOR.pink, 0, 2.1, 0);
  AddMesh(group, Box(2, 2.1, 2.9, 0.45), COLOR.cream, 3.5, 1.65, 0);
  AddMesh(group, Box(0.9, 0.95, 3, 0.15), COLOR.blue, 3.95, 2.1, 0);
  for (const x of [-1.9, 2.8]) {
    for (const z of [-1.5, 1.5]) {
      const wheel = AddMesh(group, Cylinder(0.62, 0.62, 0.4, 16), 0x5a5a68, x, 0.62, z);
      wheel.rotation.x = Math.PI / 2;
    }
  }
  AddMesh(group, Box(3.6, 1.1, 0.2), COLOR.cream, -0.5, 2.25, 1.45);
  AddStripedAwning(group, 4.2, 2.15, 3.15, COLOR.pink, COLOR.white);
  // 커다란 솜사탕
  for (const [x, color] of [[-1.5, COLOR.pink], [0.6, 0x9fdcf5]] as const) {
    AddMesh(group, Cylinder(0.05, 0.05, 1, 8), COLOR.cream, x, 4.1, 0);
    AddMesh(group, Sphere(0.75), color, x, 5, 0);
    AddMesh(group, Sphere(0.5), color, x + 0.4, 4.75, 0.2);
  }
  const sign = CreateSign(label, 5, 1, "#ef7ea3", "#ffffff");
  sign.position.set(-0.3, 3.95, 1.55);
  group.add(sign);
  return group;
}

// 꼬마 바이킹 — 앞(+z)이 광장을 본다. 배는 길이 방향(x)으로 그네처럼 흔들린다(pivot.rotation.z).
// 좌석은 배 양쪽 끝에서 가운데를 보고 앉는 4자리다. 앉은 오리는 좌석(seat) 아래에 붙여 배와 함께 흔들린다.
export interface VikingModel {
  place: LobbyPlace;
  pivot: THREE.Group;
  seats: THREE.Group[];
}

const VIKING_AXLE_Y = 5;
const VIKING_FRAME_Z = 1.9;
const VIKING_FRAME_FOOT_X = 3.1;
const VIKING_HULL_Y = -3; // 축(pivot) 기준 배 가운데 높이
// 마주 보는 가운데 두 오리 부리와, 앞뒤 오리의 부리·등이 닿지 않는 간격이다.
const VIKING_SEAT_X = [-2.75, -1, 1, 2.75];

function BuildViking(label: string): { group: THREE.Group; pivot: THREE.Group; seats: THREE.Group[] } {
  const group = new THREE.Group();
  const deck = AddMesh(group, Cylinder(4.4, 4.6, 0.3, 32), COLOR.cream, 0, 0.15, 0);
  deck.castShadow = false;

  // 양쪽 A자 기둥 + 가운데 축
  const leg_height = VIKING_AXLE_Y - 0.3;
  const leg_length = Math.hypot(VIKING_FRAME_FOOT_X, leg_height);
  const leg_angle = Math.atan2(VIKING_FRAME_FOOT_X, leg_height);
  for (const z of [-VIKING_FRAME_Z, VIKING_FRAME_Z]) {
    for (const side of [-1, 1]) {
      const leg = AddMesh(group, Cylinder(0.16, 0.2, leg_length, 10), COLOR.blue, (side * VIKING_FRAME_FOOT_X) / 2, 0.3 + leg_height / 2, z);
      leg.rotation.z = side * leg_angle;
    }
    AddMesh(group, Sphere(0.36), COLOR.yellow, 0, VIKING_AXLE_Y, z);
  }
  const axle = AddMesh(group, Cylinder(0.14, 0.14, VIKING_FRAME_Z * 2, 10), COLOR.yellow, 0, VIKING_AXLE_Y, 0);
  axle.rotation.x = Math.PI / 2;

  const pivot = new THREE.Group();
  pivot.position.y = VIKING_AXLE_Y;
  group.add(pivot);
  // 축에서 배까지 내려오는 팔
  for (const z of [-1.3, 1.3]) {
    AddMesh(pivot, Box(0.26, -VIKING_HULL_Y, 0.26, 0.08), COLOR.yellow, 0, VIKING_HULL_Y / 2, z);
  }
  // 배 몸통 + 양 끝이 들린 뱃머리 + 위쪽 노란 띠
  AddMesh(pivot, Box(6.4, 1, 2.3, 0.4), COLOR.red, 0, VIKING_HULL_Y, 0);
  for (const side of [-1, 1]) {
    const prow = AddMesh(pivot, Box(1.4, 1, 2.3, 0.4), COLOR.red, side * 3.5, VIKING_HULL_Y + 0.35, 0);
    prow.rotation.z = side * 0.55;
  }
  // 노란 띠는 양옆 난간 두 줄 — 판 하나로 덮으면 갑판이 뚜껑처럼 막혀 오리 눈 화면이 노랗게 가린다.
  for (const z of [-1.1, 1.1]) {
    AddMesh(pivot, Box(7, 0.22, 0.22, 0.08), COLOR.yellow, 0, VIKING_HULL_Y + 0.55, z);
  }
  // 뱃머리 장식 — 한쪽은 동그란 용 머리, 한쪽은 꼬리
  AddMesh(pivot, Sphere(0.5), COLOR.green, 4.15, VIKING_HULL_Y + 1.25, 0);
  AddMesh(pivot, Sphere(0.1), 0x3a2c28, 4.45, VIKING_HULL_Y + 1.4, 0.3);
  AddMesh(pivot, Sphere(0.1), 0x3a2c28, 4.45, VIKING_HULL_Y + 1.4, -0.3);
  AddMesh(pivot, new THREE.ConeGeometry(0.35, 1, 10), COLOR.green, -4.15, VIKING_HULL_Y + 1.3, 0).rotation.z = 0.5;
  // 옆면 방패 무늬
  for (const z of [-1.18, 1.18]) {
    for (const x of [-1.6, 0, 1.6]) {
      const shield = AddMesh(pivot, Cylinder(0.36, 0.36, 0.08, 16), x === 0 ? COLOR.yellow : COLOR.white, x, VIKING_HULL_Y, z);
      shield.rotation.x = Math.PI / 2;
    }
  }

  // 좌석 — 의자 + 오리를 붙일 자리. 배 왼쪽 두 자리는 +x, 오른쪽 두 자리는 -x(배 가운데)를 본다.
  const seats = VIKING_SEAT_X.map((x) => {
    AddMesh(pivot, Box(0.7, 0.3, 1.6, 0.1), COLOR.wood, x, VIKING_HULL_Y + 0.2, 0);
    const seat = new THREE.Group();
    seat.position.set(x, VIKING_HULL_Y + 0.05, 0);
    seat.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    pivot.add(seat);
    return seat;
  });

  const sign = CreateSign(label, 4, 0.95, "#e8604c", "#ffffff");
  sign.position.set(0, VIKING_AXLE_Y + 1.1, VIKING_FRAME_Z + 0.1);
  group.add(sign);
  return { group, pivot, seats };
}

// 분수 물줄기 — 동상 오리 부리에서 앞(+z)으로 포물선을 그리며 연못에 떨어진다.
// 물방울은 InstancedMesh 하나로 그리고, LobbyWorld 가 매 프레임 UpdateFountainJet() 으로 위치만 옮긴다.
// ⚠️ 반투명으로 두면 그리는 순서가 바뀌며 깜빡이므로 물방울·물결 모두 불투명으로 그린다.
export interface FountainJet {
  drops: THREE.InstancedMesh;
  ripples: THREE.Mesh[];
}

const JET_START = { y: 6.2, z: 2.1 }; // 동상 부리 끝 (오리 scale 2.1, y 2.95 기준)
const JET_SPEED_Y = 1.5;
const JET_GRAVITY = 9.8;
const POND_SURFACE_Y = 0.97;
const JET_LAND_Z = 4.6;
// 부리에서 수면까지 걸리는 시간: JET_START.y + vy·t - g·t²/2 = POND_SURFACE_Y
const JET_FLIGHT_SEC =
  (JET_SPEED_Y + Math.sqrt(JET_SPEED_Y * JET_SPEED_Y + 2 * JET_GRAVITY * (JET_START.y - POND_SURFACE_Y))) / JET_GRAVITY;
const JET_SPEED_Z = (JET_LAND_Z - JET_START.z) / JET_FLIGHT_SEC;
const JET_DROP_COUNT = 36;
const SPLASH_DROP_COUNT = 10;
const SPLASH_FLIGHT_SEC = 0.45;
const RIPPLE_SEC = 1.4;
const fountain_matrix = new THREE.Matrix4();
const fountain_position = new THREE.Vector3();
const fountain_rotation = new THREE.Quaternion();
const fountain_scale = new THREE.Vector3();

function BuildFountainJet(parent: THREE.Group): FountainJet {
  const material = new THREE.MeshLambertMaterial({ color: 0xc8f1ff, emissive: 0x2a6f8a });
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), material, JET_DROP_COUNT + SPLASH_DROP_COUNT);
  drops.castShadow = false;
  drops.receiveShadow = false;
  // 물방울이 화면 밖 판정으로 사라지지 않게 한다(인스턴스 위치가 계속 바뀐다).
  drops.frustumCulled = false;
  parent.add(drops);

  const ripples: THREE.Mesh[] = [];
  const ripple_material = new THREE.MeshBasicMaterial({ color: 0xe6f9ff });
  for (let i = 0; i < 2; i++) {
    const ripple = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), ripple_material);
    ripple.rotation.x = -Math.PI / 2;
    // 연못 수면(0.97)보다 살짝 띄워 z-fighting 을 막는다.
    ripple.position.set(0, POND_SURFACE_Y + 0.02 + i * 0.01, JET_LAND_Z);
    parent.add(ripple);
    ripples.push(ripple);
  }
  const jet = { drops, ripples };
  UpdateFountainJet(jet, 0);
  return jet;
}

export function UpdateFountainJet(jet: FountainJet, elapsed: number): void {
  // 물줄기 — 같은 포물선 위에 물방울을 시간차로 흘려 보낸다.
  for (let i = 0; i < JET_DROP_COUNT; i++) {
    const t = ((elapsed / JET_FLIGHT_SEC + i / JET_DROP_COUNT) % 1) * JET_FLIGHT_SEC;
    const wobble = Math.sin(i * 12.9898) * 0.06;
    fountain_position.set(
      wobble,
      JET_START.y + JET_SPEED_Y * t - 0.5 * JET_GRAVITY * t * t,
      JET_START.z + JET_SPEED_Z * t
    );
    // 떨어질수록 조금씩 굵어진다.
    fountain_scale.setScalar(0.75 + (t / JET_FLIGHT_SEC) * 0.45);
    fountain_matrix.compose(fountain_position, fountain_rotation, fountain_scale);
    jet.drops.setMatrixAt(i, fountain_matrix);
  }
  // 물보라 — 떨어진 자리에서 사방으로 작게 튄다.
  for (let i = 0; i < SPLASH_DROP_COUNT; i++) {
    const t = ((elapsed / SPLASH_FLIGHT_SEC + (i * 0.37) % 1) % 1) * SPLASH_FLIGHT_SEC;
    const angle = (i / SPLASH_DROP_COUNT) * Math.PI * 2;
    const spread = 1.3 + (i % 3) * 0.35;
    fountain_position.set(
      Math.cos(angle) * spread * t,
      POND_SURFACE_Y + 2.2 * t - 0.5 * JET_GRAVITY * t * t,
      JET_LAND_Z + Math.sin(angle) * spread * t
    );
    fountain_scale.setScalar(Math.max(0.05, 0.55 * (1 - t / SPLASH_FLIGHT_SEC)));
    fountain_matrix.compose(fountain_position, fountain_rotation, fountain_scale);
    jet.drops.setMatrixAt(JET_DROP_COUNT + i, fountain_matrix);
  }
  jet.drops.instanceMatrix.needsUpdate = true;

  // 물결 — 퍼지면서 가늘어지는 고리 2개가 번갈아 퍼진다.
  jet.ripples.forEach((ripple, index) => {
    const phase = (elapsed / RIPPLE_SEC + index * 0.5) % 1;
    ripple.scale.setScalar(0.3 + phase * 1.4);
    ripple.visible = phase < 0.9;
  });
}

// 가운데 조형물 — 큰 분수 위에 오리 동상이 서 있다.
function BuildDuckFountain(label: string, jets: FountainJet[]): THREE.Group {
  const group = new THREE.Group();
  AddMesh(group, Cylinder(6.1, 6.3, 0.9, 32), COLOR.stone, 0, 0.45, 0);
  const pond = AddMesh(group, Cylinder(5.5, 5.5, 0.1, 32), COLOR.water, 0, 0.92, 0);
  pond.castShadow = false;
  AddMesh(group, Cylinder(1.5, 2, 1.8, 20), COLOR.stone, 0, 1.8, 0);
  AddMesh(group, Cylinder(2.6, 2.3, 0.35, 24), COLOR.stone, 0, 2.8, 0);
  const duck = BuildDuck(0xffd96b);
  duck.scale.setScalar(2.1);
  duck.position.y = 2.95;
  group.add(duck);
  jets.push(BuildFountainJet(group));
  const sign = CreateSign(label, 4, 0.95, "#f28b3c", "#ffffff");
  sign.position.set(0, 1.45, 6.4);
  sign.rotation.x = -0.25;
  group.add(sign);
  return group;
}

// 오리 — 플레이어와 분수 동상이 함께 쓴다. 앞(+z)을 본다. 발이 y=0 이다.
export function BuildDuck(body_color = 0xffe58a): THREE.Group {
  const group = new THREE.Group();
  const body = AddMesh(group, Sphere(0.72), body_color, 0, 0.8, 0);
  body.scale.set(1, 0.95, 1.12);
  body.name = "body";
  AddMesh(group, Sphere(0.55), body_color, 0, 1.68, 0.2);
  const bill = AddMesh(group, Sphere(0.27), COLOR.orange, 0, 1.6, 0.74);
  bill.scale.set(1.15, 0.5, 0.9);
  for (const side of [-1, 1]) {
    AddMesh(group, Sphere(0.08), 0x3a2c28, side * 0.24, 1.82, 0.66);
    const cheek = AddMesh(group, Sphere(0.11), 0xffb3a7, side * 0.36, 1.6, 0.56);
    cheek.scale.z = 0.4;
    const wing = AddMesh(group, Sphere(0.32), body_color, side * 0.72, 0.9, -0.05);
    wing.scale.set(0.45, 0.85, 1);
    wing.name = side < 0 ? "wing_left" : "wing_right";
    const foot = AddMesh(group, Sphere(0.22), COLOR.orange, side * 0.28, 0.1, 0.12);
    foot.scale.set(1, 0.4, 1.4);
    foot.name = side < 0 ? "foot_left" : "foot_right";
  }
  return group;
}

// 별명표는 섬의 다른 물체(renderOrder 0)보다 나중에 그린다.
const NAME_LABEL_RENDER_ORDER = 1000;

// 머리 위 별명표 — 항상 카메라를 본다.
export function CreateNameLabel(name: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context) {
    context.font = `48px "${POP_FONT_FAMILY}"`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.lineWidth = 12;
    context.strokeStyle = "#ffffff";
    context.fillStyle = "#6a4a2b";
    context.strokeText(name, canvas.width / 2, canvas.height / 2, canvas.width - 24);
    context.fillText(name, canvas.width / 2, canvas.height / 2, canvas.width - 24);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // 건물·나무·분수 뒤에 가도 별명이 가려지지 않게 깊이 검사를 끄고, 다른 물체를 다 그린 뒤 맨 마지막에 그린다.
  // 불투명(alphaTest) 그대로라 그리는 순서가 바뀌며 깜빡이지 않는다.
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, alphaTest: 0.3, transparent: false, depthTest: false, depthWrite: false })
  );
  label.scale.set(4, 1, 1);
  label.renderOrder = NAME_LABEL_RENDER_ORDER;
  return label;
}

function BuildPlaceModel(place: LobbyPlace, jets: FountainJet[], vikings: VikingModel[]): THREE.Group {
  switch (place.kind) {
    case "statue":
      return BuildDuckFountain(place.label, jets);
    case "viking": {
      const viking = BuildViking(place.label);
      vikings.push({ place, pivot: viking.pivot, seats: viking.seats });
      return viking.group;
    }
    case "cafe_green":
      return BuildCafe(place.label, COLOR.cream, COLOR.green, COLOR.green, "#2f8a5f");
    case "cafe_red":
      return BuildCafe(place.label, 0xfdebe3, COLOR.red, COLOR.red, "#d9534a");
    case "doll_shop":
      return BuildDollShop(place.label);
    case "toy_shop":
      return BuildToyShop(place.label);
    case "food_truck":
      return BuildFoodTruck(place.label);
  }
}

function BuildTree(kind: number): THREE.Group {
  const group = new THREE.Group();
  AddMesh(group, Cylinder(0.26, 0.38, 1.6, 10), COLOR.wood, 0, 0.8, 0);
  if (kind === 0) {
    AddMesh(group, Sphere(1.45), COLOR.leaf, 0, 2.75, 0);
    AddMesh(group, Sphere(0.9), COLOR.leaf_dark, 0.65, 2.2, 0.35);
    AddMesh(group, Sphere(0.85), COLOR.leaf, -0.6, 2.25, -0.25);
  } else if (kind === 1) {
    AddMesh(group, new THREE.ConeGeometry(1.5, 2.1, 12), COLOR.leaf_dark, 0, 2.3, 0);
    AddMesh(group, new THREE.ConeGeometry(1.15, 1.8, 12), COLOR.leaf, 0, 3.4, 0);
  } else {
    AddMesh(group, Sphere(1.3), COLOR.pink, 0, 2.7, 0);
    AddMesh(group, Sphere(0.8), 0xffbfd2, 0.6, 2.25, 0.25);
    AddMesh(group, Sphere(0.75), 0xffbfd2, -0.55, 2.3, -0.2);
  }
  return group;
}

function BuildCloud(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: COLOR.white });
  for (const [x, y, radius] of [[-2.4, 0, 1.8], [0, 0.6, 2.5], [2.5, 0, 1.7]] as const) {
    const puff = new THREE.Mesh(Sphere(radius), material);
    puff.position.set(x, y, 0);
    puff.scale.y = 0.7;
    group.add(puff);
  }
  return group;
}

// 매표소 — 양옆 부스 + 가운데 아치 + 위로 열리는 게이트 막대(입장 무료).
function BuildTicketBooth(root: THREE.Group, gate_arms: THREE.Group[]): void {
  const booth = new THREE.Group();
  booth.position.set(TICKET_GATE.x, 0, TICKET_GATE.z);
  root.add(booth);

  for (const side of [-1, 1]) {
    AddMesh(booth, Box(9.5, 3.8, 4.6, 0.4), side < 0 ? COLOR.cream : 0xfff0c8, side * 7.4, 1.9, 0);
    const roof = AddMesh(booth, new THREE.ConeGeometry(7.2, 2.4, 4), side < 0 ? COLOR.red : COLOR.blue, side * 7.4, 5, 0);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.5;
    AddMesh(booth, Box(2.4, 1.5, 0.3), COLOR.blue, side * 5.4, 2.1, 2.3);
    AddMesh(booth, Box(2.4, 1.5, 0.3), COLOR.blue, side * 9.4, 2.1, 2.3);
    const awning = new THREE.Group();
    awning.position.x = side * 7.4;
    booth.add(awning);
    AddStripedAwning(awning, 8.4, 2.95, 3.15, side < 0 ? COLOR.red : COLOR.blue, COLOR.white);
    // 아치 기둥
    AddMesh(booth, Cylinder(0.35, 0.42, 6.2, 14), COLOR.white, side * 2.55, 3.1, 1.7);
    AddMesh(booth, Sphere(0.55), COLOR.yellow, side * 2.55, 6.5, 1.7);

    // 게이트 막대 — 기둥에 붙어 안쪽으로 뻗는다
    const arm = new THREE.Group();
    arm.position.set(side * 2.25, 1.3, 1.7);
    arm.userData.side = side;
    AddMesh(arm, Box(TICKET_GATE.half_width + 0.1, 0.24, 0.24, 0.1), COLOR.red, -side * (TICKET_GATE.half_width + 0.1) * 0.5, 0, 0);
    booth.add(arm);
    gate_arms.push(arm);

    // 풍선 다발
    [COLOR.red, COLOR.yellow, COLOR.blue].forEach((color, index) => {
      AddMesh(booth, Sphere(0.48), color, side * (12.6 + index * 0.35), 4.3 + index * 0.75, 3 - index * 0.3);
    });
    AddMesh(booth, Cylinder(0.03, 0.03, 4.6, 6), COLOR.white, side * 12.8, 2.3, 2.8);
  }
  // 간판은 기둥 머리보다 높게 올려 글자가 가리지 않게 한다.
  const arch = AddMesh(booth, Box(7.4, 1.5, 0.5, 0.3), COLOR.orange, 0, 7.6, 1.7);
  arch.receiveShadow = false;
  const title = CreateSign("매표소 · 무료 입장! 건물 앞으로 걸어가 보세요.", 7, 1.3, "#f28b3c", "#ffffff");
  title.position.set(0, 7.6, 2);
  booth.add(title);
}

function BuildBridges(root: THREE.Group): void {
  for (const bridge of LOBBY_BRIDGES) {
    const dx = bridge.to.x - bridge.from.x;
    const dz = bridge.to.z - bridge.from.z;
    const length = Math.hypot(dx, dz);
    const group = new THREE.Group();
    group.position.set(bridge.from.x, 0, bridge.from.z);
    group.rotation.y = Math.atan2(dx, dz);
    root.add(group);
    const plank_count = Math.floor(length / 0.85);
    for (let i = 0; i < plank_count; i++) {
      const t = (i + 0.5) / plank_count;
      AddMesh(group, Box(3.6, 0.2, 0.7, 0.06), i % 2 === 0 ? COLOR.wood : COLOR.wood_dark, 0, 0.1 + Math.sin(t * Math.PI) * 0.8, t * length);
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        AddMesh(group, Cylinder(0.1, 0.1, 1.5, 8), COLOR.wood_dark, side * 1.75, 0.8 + Math.sin(t * Math.PI) * 0.8, t * length);
      }
    }
    // 입구 통제 표지 — 뒤에 올 2~5번 섬 공사 중
    AddMesh(group, Box(3.3, 0.22, 0.22, 0.08), COLOR.yellow, 0, 1.3, 0.3);
    AddMesh(group, Box(3.3, 0.22, 0.22, 0.08), COLOR.red, 0, 0.8, 0.3);
    const sign = CreateSign("공사 중", 2.4, 0.8, "#f6c343", "#6a4a2b");
    sign.position.set(0, 2, 0.1);
    sign.rotation.y = Math.PI;
    group.add(sign);
  }
}

function AddPathTo(root: THREE.Group, x: number, z: number): void {
  const from_x = (x / Math.hypot(x, z)) * 9;
  const from_z = (z / Math.hypot(x, z)) * 9;
  const dx = x - from_x;
  const dz = z - from_z;
  const length = Math.hypot(dx, dz);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(3.2, length), Mat(COLOR.path));
  path.rotation.set(-Math.PI / 2, 0, -Math.atan2(dx, dz) + Math.PI);
  path.position.set(from_x + dx / 2, 0.06, from_z + dz / 2);
  path.receiveShadow = true;
  root.add(path);
}

function BuildGround(root: THREE.Group): THREE.Mesh {
  const water = new THREE.Mesh(new THREE.CircleGeometry(220, 48), Mat(COLOR.water));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.6;
  root.add(water);

  const beach = AddMesh(root, Cylinder(ISLAND_RADIUS + 2.6, ISLAND_RADIUS + 5.5, 1.5, 64), COLOR.sand, 0, -0.95, 0);
  beach.castShadow = false;
  // ⚠️ 절벽 윗면을 잔디(y=0)와 같은 높이에 두면 두 면이 겹쳐 카메라가 움직일 때 깜빡인다(z-fighting) — 살짝 아래에 둔다.
  const cliff = AddMesh(root, Cylinder(ISLAND_RADIUS, ISLAND_RADIUS + 1.3, 1.1, 64), COLOR.grass_side, 0, -0.6, 0);
  cliff.castShadow = false;
  const grass = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_RADIUS, 64), Mat(COLOR.grass));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  root.add(grass);

  const plaza = new THREE.Mesh(new THREE.CircleGeometry(10, 48), Mat(COLOR.path));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.03;
  plaza.receiveShadow = true;
  root.add(plaza);

  // 입구에서 광장까지 곧은 길, 광장에서 건물까지 갈래길
  AddPathTo(root, 0, 29);
  for (const place of LOBBY_PLACES) {
    if (place.kind !== "statue") AddPathTo(root, place.x, place.z);
  }
  return water;
}

function IsNearBridge(x: number, z: number): boolean {
  return LOBBY_BRIDGES.some((bridge) => Math.hypot(x - bridge.from.x, z - bridge.from.z) < 6);
}

function BuildDecorations(root: THREE.Group, obstacles: WorldObstacle[]): void {
  // 섬 가장자리를 두르는 나무 — 위치가 매번 같도록 난수를 쓰지 않는다.
  const tree_count = 36;
  for (let i = 0; i < tree_count; i++) {
    const angle = (i / tree_count) * Math.PI * 2;
    const radius = 25.6 + (i % 3) * 1.15;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (z > 15 && Math.abs(x) < 15) continue;
    if (IsNearBridge(x, z)) continue;
    if (LOBBY_PLACES.some((place) => Math.hypot(x - place.x, z - place.z) < place.collide_radius + 2.2)) continue;
    const tree = BuildTree(i % 3);
    tree.position.set(x, 0, z);
    tree.scale.setScalar(1 + (i % 4) * 0.12);
    root.add(tree);
    obstacles.push({ x, z, radius: 0.9 });
  }

  // 광장 둘레 가로등과 꽃
  const lamp_count = 8;
  for (let i = 0; i < lamp_count; i++) {
    const angle = ((i + 0.5) / lamp_count) * Math.PI * 2;
    const x = Math.cos(angle) * 10.6;
    const z = Math.sin(angle) * 10.6;
    AddMesh(root, Cylinder(0.11, 0.15, 3.3, 10), 0x5b6b7a, x, 1.65, z);
    AddMesh(root, Sphere(0.38), COLOR.yellow, x, 3.45, z);
    obstacles.push({ x, z, radius: 0.35 });
  }
  const flower_colors = [COLOR.pink, COLOR.yellow, COLOR.white, COLOR.red];
  for (let i = 0; i < 64; i++) {
    const angle = i * 2.399963;
    const radius = 11.8 + (i % 7) * 1.75;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (LOBBY_PLACES.some((place) => Math.hypot(x - place.x, z - place.z) < place.collide_radius + 1)) continue;
    if (Math.abs(x) < 2.2 && z > 0) continue;
    AddMesh(root, Sphere(0.16), flower_colors[i % flower_colors.length], x, 0.2, z);
  }
}

export function BuildIslandOne(): IslandOneModel {
  const root = new THREE.Group();
  const place_groups = new Map<string, THREE.Group>();
  const gate_arms: THREE.Group[] = [];
  const obstacles: WorldObstacle[] = [
    ...LOBBY_PLACES.map((place) => ({ x: place.x, z: place.z, radius: place.collide_radius })),
    ...TICKET_BOOTH_OBSTACLES,
  ];

  const water = BuildGround(root);
  const fountain_jets: FountainJet[] = [];
  const vikings: VikingModel[] = [];
  for (const place of LOBBY_PLACES) {
    const group = BuildPlaceModel(place, fountain_jets, vikings);
    group.position.set(place.x, 0, place.z);
    // 분수를 뺀 건물은 앞면(+z)이 광장을 본다. 분수 간판은 매표소 쪽을 본다.
    if (place.kind !== "statue") group.rotation.y = Math.atan2(-place.x, -place.z);
    root.add(group);
    place_groups.set(place.id, group);
  }
  BuildTicketBooth(root, gate_arms);
  BuildBridges(root);
  BuildDecorations(root, obstacles);

  const clouds = [
    [-30, 20, -34],
    [24, 24, -48],
    [-12, 27, -60],
    [38, 21, -18],
  ].map(([x, y, z]) => {
    const cloud = BuildCloud();
    cloud.position.set(x, y, z);
    root.add(cloud);
    return cloud;
  });

  return { root, place_groups, gate_arms, water, clouds, fountain_jets, viking: vikings[0] ?? null, obstacles };
}
