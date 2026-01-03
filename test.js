import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";

// ==========================================
// 1. INITIAL SETUP & SCENE CONFIGURATION
// ==========================================

// Scene
const scene = new THREE.Scene();
const skyColor = new THREE.Color(0x87ceeb);
scene.background = skyColor;

// Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(30, 20, 30);
camera.up.set(0, 1, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 5, 0);
controls.enabled = true;
controls.update();

// Clock
const clock = new THREE.Clock();

// ==========================================
// 2. ADVANCED LIGHTING SYSTEM
// ==========================================

// Ambient Light
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

// Directional Light (Main Sun)
const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 5000; // 🔥 Ganti ke 5000 biar tembus sampai bawah jembatan
dirLight.shadow.camera.left = -500; // 🔥 Perlebar defaultnya
dirLight.shadow.camera.right = 500;
dirLight.shadow.camera.top = 500;
dirLight.shadow.camera.bottom = -500;
scene.add(dirLight);
scene.add(dirLight.target);
// Hemisphere Light
const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x8b4513, 0.5);
scene.add(hemisphereLight);

// Spot Light
const spotLight = new THREE.SpotLight(0xffffff, 1.0, 200, Math.PI / 6, 0.5, 2);
spotLight.position.set(30, 40, 30);
spotLight.castShadow = true;
spotLight.shadow.mapSize.width = 1024;
spotLight.shadow.mapSize.height = 1024;
scene.add(spotLight);

// Point Light
const pointLight = new THREE.PointLight(0xff6600, 0.5, 50);
pointLight.position.set(-10, 5, -10);
scene.add(pointLight);

// ==========================================
// 3. LOADERS
// ==========================================

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

// ==========================================
// 4. GLOBAL VARIABLES
// ==========================================

let currentMapModel = null;
let cameraTarget = new THREE.Object3D();
scene.add(cameraTarget);

// Car System
let carModel = null;
let carWheels = [];
let frontWheels = [];
let pivotFL, pivotFR;
let carSpeed = 0;
let steeringAngle = 0;
const raycaster = new THREE.Raycaster();
const downVector = new THREE.Vector3(0, -1, 0);

// Car Settings
const carSettings = {
  maxSpeed: 0.8,
  acceleration: 0.01,
  friction: 0.98,
  turnSpeed: 0.03,
  followCamera: true,
  autoDrive: false,
};

// Keyboard Input
const keys = { w: false, a: false, s: false, d: false };

// Event Listener Keyboard
window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  keys[key] = true;

  // Fitur Baru: Cek Koordinat dengan tombol 'P'
  if (key === "p") {
    checkCoordinates();
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

// ==========================================
// 5. HELPER FUNCTIONS
// ==========================================

// Fungsi untuk mengecek koordinat
function checkCoordinates() {
  if (carModel) {
    const pos = carModel.position;
    const rot = carModel.rotation;

    console.log(`📍 COORDINATE REPORT:`);
    console.log(`Position: x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)}, z: ${pos.z.toFixed(2)}`);
    console.log(`Rotation Y: ${rot.y.toFixed(2)}`);
    console.log(`------------------------`);

    alert(`📍 Koordinat Mobil:\nX: ${pos.x.toFixed(2)}\nY: ${pos.y.toFixed(2)}\nZ: ${pos.z.toFixed(2)}\n\n(Cek Console F12 untuk copy)`);
  } else {
    console.warn("Mobil belum dimuat!");
  }
}

// ==========================================
// 6. CAR LOADING & ANIMATION SYSTEM
// ==========================================
function loadCar() {
  console.log("🚗 Memuat Mobil Nissan GT-R (Smart Offset)...");
  const carPath = "./source/2018_nissan_gr.glb";

  gltfLoader.load(
    carPath,
    (gltf) => {
      carModel = gltf.scene;

      // --- A. POSISI & ORIENTASI ---
      carModel.position.set(0, 0, 0);
      carModel.rotation.y = 0; // Menghadap depan

      // Update Matrix agar posisi wheel & brake akurat saat diambil nanti
      carModel.updateMatrixWorld(true);

      // Reset variable container
      carWheels = [];
      pivotFL = null;
      pivotFR = null;

      // --- B. FUNGSI PEMBANTU: SETUP SMART OFFSET ---
      // Fungsi ini kita taruh di dalam agar mudah akses carModel
      const setupFrontSystem = (wheelName, brakeName) => {
        const wheelMesh = carModel.getObjectByName(wheelName);
        const brakeMesh = carModel.getObjectByName(brakeName);

        if (wheelMesh && brakeMesh) {
          const pivot = new THREE.Group();

          // 1. Ambil posisi aslinya di dunia 3D
          const wheelPos = wheelMesh.position.clone();
          const brakePos = brakeMesh.position.clone();

          // 2. HITUNG JARAK (OFFSET) OTOMATIS
          // Rumus: Posisi Kaliper - Posisi Roda
          // Ini menjaga agar kaliper tetap di tempat aslinya, tidak ketarik ke tengah
          const offset = new THREE.Vector3().subVectors(brakePos, wheelPos);

          // 3. Pindahkan Pivot ke posisi roda
          pivot.position.copy(wheelPos);

          // 4. Attach Pivot ke Mobil
          carModel.add(pivot);

          // 5. Masukkan Roda & Rem ke dalam Pivot
          pivot.add(wheelMesh);
          pivot.add(brakeMesh);

          // 6. Reset Posisi (FINAL FIX)
          wheelMesh.position.set(0, 0, 0); // Roda pas di tengah as
          brakeMesh.position.copy(offset); // Kaliper ditaruh sesuai jarak aslinya

          // 7. Masukkan Roda ke array putar
          carWheels.push(wheelMesh);

          return pivot; // Kembalikan pivot untuk kontrol steering
        } else {
          console.error(`❌ Part tidak ditemukan: ${wheelName} atau ${brakeName}`);
          return null;
        }
      };

      // --- C. EKSEKUSI SETUP ---
      // Setup Roda Depan (Pakai Pivot & Smart Offset)
      pivotFL = setupFrontSystem("Roda_depan_kiri", "Rem_depan_kiri");
      pivotFR = setupFrontSystem("Roda_depan_kanan", "Rem_depan_kanan");

      // Setup Roda Belakang (Cukup ambil mesh untuk putar)
      const rodaRL = carModel.getObjectByName("Roda_belakang_kiri");
      const rodaRR = carModel.getObjectByName("Roda_belakang_kanan");

      // Pastikan kaliper belakang terbawa (untuk shadow/render)
      // Kita tidak perlu memanipulasi kaliper belakang karena dia statis

      if (rodaRL) carWheels.push(rodaRL);
      if (rodaRR) carWheels.push(rodaRR);

      // Setup Shadow
      carModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      scene.add(carModel);
      console.log("✅ Mobil Siap: Posisi & Kaliper Aman!");
    },
    undefined,
    (err) => console.error("❌ Gagal load mobil:", err)
  );
}

function toggleCarLights(turnOn) {
  if (!carModel) return;

  // --- A. SETUP INITIAL (JALAN SEKALI SAJA) ---
  if (!carModel.userData.lightsInitialized) {
    carModel.userData.lightSources = []; // Penampung cahaya sorot

    // 1. CARI MESH BAWAAN GLB & SIAPKAN MATERIAL
    carModel.traverse((child) => {
      if (child.isMesh) {
        // Konfigurasi Lampu Depan
        if (child.name === "Lampu_Depan") {
          // Clone material agar tidak merusak part lain yang warnanya sama
          child.material = child.material.clone();
          child.material.emissiveMap = null; // Reset map jika ada
          child.material.emissive = new THREE.Color(0xffffff); // Warna Putih
          child.material.emissiveIntensity = 0; // Mulai dari mati
          carModel.userData.meshLampuDepan = child;
        }

        // Konfigurasi Lampu Belakang
        if (child.name === "Lampu_Belakang") {
          child.material = child.material.clone();
          child.material.emissive = new THREE.Color(0xff0000); // Warna Merah
          child.material.emissiveIntensity = 0; // Mulai dari mati
          carModel.userData.meshLampuBelakang = child;
        }
      }
    });

    // 2. BUAT SUMBER CAHAYA (SOROTAN KE JALAN)
    // Kita tetap butuh ini agar aspal menjadi terang

    // Fungsi bikin SpotLight (Headlight)
    const addSpotLight = (x, y, z) => {
      const light = new THREE.SpotLight(0xffffff, 0, 80, 0.6, 0.5, 1);
      light.position.set(x, y, z);
      light.target.position.set(x, 0.5, z + 10); // Sorot ke depan
      carModel.add(light);
      carModel.add(light.target);
      carModel.userData.lightSources.push({ light: light, type: "head" });
    };

    // Fungsi bikin PointLight (Taillight - Cahaya merah di aspal belakang)
    const addPointLight = (x, y, z) => {
      const light = new THREE.PointLight(0xff0000, 0, 5, 2);
      light.position.set(x, y, z);
      carModel.add(light);
      carModel.userData.lightSources.push({ light: light, type: "tail" });
    };

    // Posisi manual (Sesuaikan sedikit jika kurang pas dengan posisi mesh aslimu)
    // Depan (Kiri & Kanan)
    addSpotLight(0.75, 0.85, 2.1);
    addSpotLight(-0.75, 0.85, 2.1);
    // Belakang (Kiri & Kanan)
    addPointLight(0.65, 0.95, -2.35);
    addPointLight(-0.65, 0.95, -2.35);

    carModel.userData.lightsInitialized = true;
  }

  // --- B. LOGIKA ON/OFF ---

  // 1. Atur Visual Mesh (Glowing Effect)
  // Intensity tinggi (5 atau 10) agar efek Bloom bekerja maksimal
  if (carModel.userData.meshLampuDepan) {
    carModel.userData.meshLampuDepan.material.emissiveIntensity = turnOn ? 10 : 0;
  }
  if (carModel.userData.meshLampuBelakang) {
    carModel.userData.meshLampuBelakang.material.emissiveIntensity = turnOn ? 5 : 0;
  }

  // 2. Atur Sumber Cahaya (Sorotan)
  carModel.userData.lightSources.forEach((item) => {
    if (item.type === "head") {
      item.light.intensity = turnOn ? 30 : 0; // Headlight terang
    } else {
      item.light.intensity = turnOn ? 3 : 0; // Taillight redup
    }
  });
}

// ==========================================
// 3. FUNGSI UPDATE CAR (ANIMASI + PHYSICS)
// ==========================================
function updateCar() {
  if (!carModel) return;

  const currentScale = carModel.scale.x;

  // --- 1. Physics (Gas/Rem) ---
  if (carSettings.autoDrive) {
    // Logika Auto Drive Sederhana
    if (carSpeed < carSettings.maxSpeed * 0.5) carSpeed += carSettings.acceleration;
  } else {
    // Manual Control
    if (keys.w) carSpeed += carSettings.acceleration;
    if (keys.s) carSpeed -= carSettings.acceleration;
  }

  // Friction (Gaya gesek agar mobil melambat pelan2)
  carSpeed *= carSettings.friction;

  // --- 2. Steering Logic ---
  let targetSteering = 0;
  // Mobil hanya bisa belok jika bergerak (realistis)
  if (Math.abs(carSpeed) > 0.01) {
    if (keys.a) {
      carModel.rotation.y += carSettings.turnSpeed;
      targetSteering = 0.5;
    }
    if (keys.d) {
      carModel.rotation.y -= carSettings.turnSpeed;
      targetSteering = -0.5;
    }
  }
  steeringAngle += (targetSteering - steeringAngle) * 0.1;

  if (carModel && dirLight && lightingConfig.shadowAutoUpdate) {
      const carPos = carModel.position;
      
      // Update posisi lampu mengikuti mobil
      dirLight.position.set(
          carPos.x + lightingConfig.dirPositionX,
          carPos.y + lightingConfig.dirPositionY,
          carPos.z + lightingConfig.dirPositionZ
      );
      
      // Update target lampu ke mobil
      dirLight.target.position.copy(carPos);
      dirLight.target.updateMatrixWorld();
      
      // (Opsional) Update nilai GUI Target X/Z biar angkanya ikut berubah real-time
      // lightingConfig.targetX = carPos.x;
      // lightingConfig.targetZ = carPos.z;
  }
  // --- 3. COLLISION SYSTEM (BARU) ---
  // Cek apakah di depan ada tembok?
  if (Math.abs(carSpeed) > 0.01) {
    // Hanya cek jika bergerak
    if (checkCollision(currentScale)) {
      // Efek Tabrakan:
      // 1. Balikkan arah speed (Bounce effect)
      carSpeed = -carSpeed * 0.5;

      // 2. (Opsional) Jika AutoDrive, paksa stop sebentar atau putar balik logic
      if (carSettings.autoDrive) {
        // Untuk cinematic, kalau nabrak kita stop aja biar ga aneh
        carSpeed = 0;
      }
    }
  }

  // --- 4. Movement (Update Posisi) ---
  // translateZ menggerakkan mobil ke arah hadapnya
  carModel.translateZ(carSpeed * currentScale);

  // --- 5. Ground Logic (Gravity) ---
  if (currentMapModel) {
    const rayOrigin = carModel.position.clone();
    // Raycast origin juga harus menyesuaikan scale agar tidak tembus tanah saat mobil besar
    rayOrigin.y += 2 * currentScale;

    raycaster.set(rayOrigin, downVector);
    const intersects = raycaster.intersectObject(currentMapModel, true);
    if (intersects.length > 0) {
      const groundOffset = 0.02 * currentScale;

      // Update posisi Y mobil menempel ke aspal
      carModel.position.y = intersects[0].point.y + groundOffset;
    } else {
      // Fallback jika mobil "terbang" keluar map (Gravity sederhana)
      carModel.position.y -= 0.5;
    }
  }

  // ==========================================
  // --- 6. ANIMASI RODA ---
  // ==========================================

  // A. PUTAR BAN (MAJU) - Sumbu X
  carWheels.forEach((ban) => {
    ban.rotation.x += carSpeed * 10;
  });

  // B. BELOKKAN PIVOT (STEER) - Sumbu Y
  if (pivotFL) pivotFL.rotation.y = steeringAngle;
  if (pivotFR) pivotFR.rotation.y = steeringAngle;

  // --- 7. Camera Follow ---
  if (carSettings.followCamera) {
    const relativeCameraOffset = new THREE.Vector3(0, cameraConfig.height, -cameraConfig.distance);
    const cameraOffset = relativeCameraOffset.applyMatrix4(carModel.matrixWorld);

    // Camera Collision (Agar kamera tidak tembus tembok saat di gedung sempit)
    if (cameraConfig.collisionEnabled) {
      const rayOrigin = carModel.position.clone();
      rayOrigin.y += 5;
      const rayDirection = cameraOffset.clone().sub(rayOrigin).normalize();
      const rayDistance = rayOrigin.distanceTo(cameraOffset);

      raycaster.set(rayOrigin, rayDirection);
      const intersects = currentMapModel ? raycaster.intersectObject(currentMapModel, true) : [];

      if (intersects.length > 0 && intersects[0].distance < rayDistance) {
        // Kamera maju mendekat jika terhalang tembok
        cameraOffset.copy(intersects[0].point).add(rayDirection.clone().multiplyScalar(-cameraConfig.collisionOffset));
      }
    }

    camera.position.lerp(cameraOffset, cameraConfig.damping);
    const targetLook = carModel.position.clone();
    targetLook.y += cameraConfig.lookAtY;

    camera.lookAt(targetLook);
    controls.target.copy(targetLook);

    if (camera.fov !== cameraConfig.fov) {
      camera.fov = cameraConfig.fov;
      camera.updateProjectionMatrix();
    }
  }
}
// ==========================================
// 7. CINEMATIC DIRECTOR SYSTEM (NEW)
// ==========================================

// --- A. CAMERA CUTS DATABASE ---
// Tempat menyimpan preset posisi kamera untuk cinematics
const CAM_CUTS = {
  // Shot untuk American Underpass
  AU_Start: {
    pos: new THREE.Vector3(0, 2, 10),
    tgt: new THREE.Vector3(0, 0.5, 0),
    roll: new THREE.Vector3(0, 1, 0),
  },
  AU_Side: {
    pos: new THREE.Vector3(5, 0.5, 0),
    tgt: new THREE.Vector3(0, 0.5, 0),
    roll: new THREE.Vector3(-0.2, 1, 0),
  },
  AU_Top: {
    pos: new THREE.Vector3(0, 20, 0),
    tgt: new THREE.Vector3(0, 0, 5),
    roll: new THREE.Vector3(0, 0, 1),
  },
  // Shot untuk Coast Road
  Coast_Intro: {
    pos: new THREE.Vector3(50, 10, 50),
    tgt: new THREE.Vector3(50, 5, 20),
    roll: new THREE.Vector3(0, 1, 0),
  },
  Coast_Wheel: {
    pos: new THREE.Vector3(52, 1, 22),
    tgt: new THREE.Vector3(50, 0.5, 20),
    roll: new THREE.Vector3(0, 1, 0),
  },

  // --- CITY SHOTS---
  // Shot 1: Dari depan bawah (Intro Parkir)
  City_Park_Low: {
    pos: new THREE.Vector3(125, -8, -190), // Di depan mobil agak nyerong
    tgt: new THREE.Vector3(119, -9, -197), // Fokus ke mobil
    roll: new THREE.Vector3(0, 1, 0),
  },
  // Shot 2: Drone View (Untuk melihat mobil belok)
  City_Drone_Turn: {
    pos: new THREE.Vector3(100, 10, -210), // Dari atas gedung/drone
    tgt: new THREE.Vector3(119, -9, -197), // Fokus ke area belokan
    roll: new THREE.Vector3(0, 1, 0),
  },
  // Shot 3: Cinematic Side (Action)
  City_Action_Side: {
    pos: new THREE.Vector3(115, -8, -205), // Samping mobil
    tgt: new THREE.Vector3(119, -9, -197),
    roll: new THREE.Vector3(0, 1, 0),
  },
};

// --- B. DIRECTOR ENGINE ---
// Mesin utama yang mengatur play/stop dan update sequence
const Director = {
  active: false,
  currentCut: null,
  startTime: 0,
  scenarioUpdate: null,
  pendingScenario: null,

  loadScenario: function (scenarioFunc) {
    this.stop();
    this.pendingScenario = scenarioFunc;
    console.log("🎬 Skenario siap. Klik 'Play Cinematic' untuk mulai.");
  },

  play: function () {
    if (!this.pendingScenario) {
      alert("Map ini tidak memiliki skenario film khusus.");
      return;
    }

    this.active = true;
    this.startTime = clock.getElapsedTime();
    controls.enabled = false;
    carSettings.followCamera = false;
    this.scenarioUpdate = this.pendingScenario;
    this.currentCut = null;
    console.log("🎬 Action! Scenario Started.");
  },

  cutTo: function (cutName) {
    const data = CAM_CUTS[cutName];
    if (!data) return;
    this.currentCut = cutName;
    this.startTime = clock.getElapsedTime();
    camera.position.copy(data.pos);
    controls.target.copy(data.tgt);
    if (data.roll) camera.up.copy(data.roll);
    else camera.up.set(0, 1, 0);
    camera.lookAt(controls.target);
  },

  stop: function () {
    this.active = false;
    this.scenarioUpdate = null;
    this.currentCut = null;

    // Kembalikan kontrol ke manual
    controls.enabled = true;
    camera.up.set(0, 1, 0);
    carSettings.followCamera = true;
    carSettings.autoDrive = false;
    console.log("🎬 Cut! Manual Control.");
  },

  update: function (delta) {
    if (!this.active || !this.scenarioUpdate) return;
    const timeInShot = clock.getElapsedTime() - this.startTime;
    const totalTime = clock.getElapsedTime();
    this.scenarioUpdate(delta, timeInShot, totalTime);
    camera.lookAt(controls.target);
  },
  playScenario: function (scenarioFunc) {
    this.active = true;
    this.startTime = clock.getElapsedTime();
    controls.enabled = false;
    // Matikan follow camera agar Director memegang kendali
    carSettings.followCamera = false;

    this.scenarioUpdate = scenarioFunc;
    console.log("🎬 Action! Scenario Started.");
  },
};

// ==========================================
// 8. MAP SYSTEM (SCENE FUNCTIONS)
// ==========================================

// Global variable untuk reset spawn logic
let currentSpawnInfo = { x: 0, y: 2, z: 0, rot: 0 };

// --- CORE LOADER HELPER ---
function coreLoadMap(fileName, onMapLoaded) {
  const loadingDiv = document.getElementById("loading");
  if (loadingDiv) {
    loadingDiv.style.display = "flex";
    loadingDiv.innerHTML = '<div class="spinner"></div><span>Memuat Scene...</span>';
  }

  // Hapus map lama
  if (currentMapModel) {
    scene.remove(currentMapModel);
    currentMapModel.traverse((child) => {
      if (child.isMesh) {
        if (child.material) child.material.dispose();
        if (child.geometry) child.geometry.dispose();
      }
    });
    currentMapModel = null;
  }

  // Stop previous cinematic if running
  Director.stop();
  Director.pendingScenario = null;

  // Khusus Test Mode
  if (fileName === "test") {
    createTestModel();
    finishLoading(); // Panggil fungsi selesai
    if (onMapLoaded) onMapLoaded();
    return;
  }

  const path = `./env/${fileName}`;

  gltfLoader.load(
    path,
    (gltf) => {
      currentMapModel = gltf.scene;
      currentMapModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(currentMapModel);

      console.log(`✅ Map ${fileName} loaded!`);

      // 🔥 FIX GLITCH: Panggil fungsi ini SAAT SELESAI LOAD
      finishLoading();

      if (onMapLoaded) onMapLoaded();
    },
    undefined,
    (err) => {
      console.error("Gagal load map:", err);
      finishLoading(); // Tetap buka layar meski error agar tidak stuck gelap
    }
  );
}

// Fungsi Bantuan Baru: Menangani penutupan layar loading & transisi
function finishLoading() {
  const loadingDiv = document.getElementById("loading");
  if (loadingDiv) loadingDiv.style.display = "none";

  // Cari elemen transisi global dan hilangkan (Opacity 0)
  // Kita gunakan ID yang akan kita pasang di langkah berikutnya
  const globalCurtain = document.getElementById("global-fade-curtain");
  if (globalCurtain) {
    // Beri sedikit delay agar tidak kaget (0.5 detik setelah render siap)
    setTimeout(() => {
      globalCurtain.style.opacity = "0";
    }, 500);
  }
}
function setSpawn(x, y, z, rotationY = 0) {
  if (carModel) {
    carModel.position.set(x, y, z);
    carModel.rotation.y = rotationY;
    carSpeed = 0;
    steeringAngle = 0;
    currentSpawnInfo = { x, y, z, rot: rotationY };
    updateCar();
  }
}

// --- SCENE SCENARIOS (LOGIC PER MAP) ---

function scene_AmericanUnderpass() {
  console.log("🎬 Map: American Underpass");
  coreLoadMap("american_road_underpass_bridge.glb", () => {
    setSpawn(-1124, -15, -94, Math.PI / 2);
    lightingThemes.daylight();

    scaleParams.autoScale = false;

    // Update slider GUI agar sinkron
    if (scaleParams) scaleParams.size = 1.5;

    // LOGIKA CINEMATIC MAP INI
    Director.loadScenario((delta, timeInShot) => {
      // 1. START: Shot Belakang
      if (Director.currentCut === null) {
        Director.cutTo("AU_Start");
        carSettings.autoDrive = true;
        carSettings.maxSpeed = 0.5;
      }

      if (Director.currentCut === "AU_Start") {
        camera.position.z += 1.5 * delta; // Efek dolly out
        if (timeInShot > 4.0) Director.cutTo("AU_Side");
      }

      // 2. Shot Samping
      else if (Director.currentCut === "AU_Side") {
        if (carModel) {
          // Kamera tracking samping
          camera.position.x = carModel.position.x + 5;
          camera.position.z = carModel.position.z;
          controls.target.copy(carModel.position);
        }
        if (timeInShot > 4.0) Director.cutTo("AU_Top");
      }

      // 3. Shot Atas (Ending)
      else if (Director.currentCut === "AU_Top") {
        carSettings.maxSpeed = 2.0; // Ngebut
        if (timeInShot > 4.0) Director.stop(); // Selesai
      }
    });
  });
}

function scene_AmericanCurve() {
  console.log("🎬 Map: American Curve");
  coreLoadMap("american_road_curve_ahead.glb", () => {
    setSpawn(-200, 427, -290, Math.PI); // Default spawn
    lightingThemes.daylight();
    //
    scaleParams.autoScale = false;
    if (carModel) carModel.scale.set(1.5, 1.5, 1.5);
    if (scaleParams) scaleParams.size = 1.5;

    //
    // Setup Basic Cinematic
    Director.loadScenario((delta, timeInShot) => {
      if (Director.currentCut === null) {
        // Gunakan preset kamera cinematic default jika belum ada cut khusus
        camPresets.cinematic();
        Director.currentCut = "Intro";
      }
      // Intro 3 detik lalu main
      if (timeInShot > 3.0) Director.stop();
    });
  });
}

function scene_CoastRoadAndRocks() {
  console.log("🎬 Map: Coast Road");
  coreLoadMap("coast_road_and_rocks_ver2.0.glb", () => {
    setSpawn(-55, 13, 43.5, Math.PI / 2);
    lightingThemes.sunset();

    scaleParams.autoScale = false;
    if (carModel) carModel.scale.set(1, 1, 1);
    if (scaleParams) scaleParams.size = 1;

    Director.loadScenario((delta, timeInShot) => {
      if (Director.currentCut === null) Director.cutTo("Coast_Intro");

      if (Director.currentCut === "Coast_Intro") {
        controls.target.x += 2 * delta; // Panning
        if (timeInShot > 5) Director.cutTo("Coast_Wheel");
      }

      if (Director.currentCut === "Coast_Wheel") {
        if (timeInShot > 3) {
          Director.stop();
          camPresets.driverView(); // Ganti ke view supir
        }
      }
    });
  });
}

function scene_CoastTunnel() {
  console.log("🎬 Map: Coast Tunnel");
  if (scaleParams) scaleParams.size = 0.5;
  coreLoadMap("coast_road_tunnel_and_rock.glb", () => {
    setSpawn(106, 8, 0.5, (Math.PI * 3) / 2);
    lightingThemes.night();
  });
}

function scene_HokkaidoSnow() {
  console.log("🎬 Map: Hokkaido Snowfield");
  coreLoadMap("hokkaido_snowfield_mountain_road_and_forest.glb", () => {
    setSpawn(0, 2, 0, 0);
    lightingThemes.foggy(); // Tema salju
  });
}

function scene_MountainRoad() {
  console.log("🎬 Map 3: Mountain Road (Hybrid: Coord + Duration)");

  if (typeof AutoShowcase !== "undefined") AutoShowcase.active = false;

  coreLoadMap("mountain_road_scene.glb", () => {
    // =========================================
    // 1. SETTING JALUR (HYBRID SYSTEM)
    // =========================================
    const TRACK_PATH = [
      // --- TIKUNGAN 1
      {
        x: -1.0,
        z: -2.28, // 📍 MULAI BELOK DISINI (Koordinat Anda)
        turnVal: -0.4, // Kekuatan Belok (Negatif = Kanan)
        rotSpeed: 0.03, // Kecepatan putar body
        name: "Tikungan 1",
      },
      {
        x: -0.99,
        z: -2.23, // 📍 Koordinat Selesai (Contoh)
        turnVal: 0.0, // Ban Lurus
        rotSpeed: 0.0, // Stop Putar Body
        name: "Selesai Tikungan 1 (Lurus)",
      },

      // --- TIKUNGAN 2
      {
        x: -0.96,
        z: -1.85, // 📍 Koordinat dari Laporan Anda
        turnVal: 0.4, // Ganti tanda: (-) Kanan, (+) Kiri
        rotSpeed: 0.035, // ⚙️ INI PENGATUR KETAJAMAN BELOK
        duration: 0.345, // Berapa lama dia belok
        name: "Tikungan 2",
      },

      // --- TIKUNGAN 3
      {
        x: -1.04,
        z: -1.47, // 📍 Koordinat dari Laporan Anda
        turnVal: 0.4, // Ganti tanda: (-) Kanan, (+) Kiri
        rotSpeed: -0.03, // ⚙️ INI PENGATUR KETAJAMAN BELOK
        duration: 0.25, // Berapa lama dia belok
        name: "Tikungan 3",
      },

      // --- TIKUNGAN 4
      {
        x: -1.02,
        z: -1.13, // 📍 Koordinat dari Laporan Anda
        turnVal: -0.4, // Ganti tanda: (-) Kanan, (+) Kiri
        rotSpeed: -0.027, // ⚙️ INI PENGATUR KETAJAMAN BELOK
        // duration: 0.85, // Berapa lama dia belok
        name: "Tikungan 4",
      },

      {
        x: -0.98,
        z: -1.06, // 📍 Koordinat Selesai (Contoh)
        turnVal: 0.0, // Ban Lurus
        rotSpeed: 0.0, // Stop Putar Body
        name: "Selesai Tikungan 4 (Lurus)",
      },

      // --- TIKUNGAN 5
      {
        x: -0.75,
        z: -0.8, // 📍 Koordinat dari Laporan Anda
        turnVal: -0.4, // Ganti tanda: (-) Kanan, (+) Kiri
        rotSpeed: 0.035, // ⚙️ INI PENGATUR KETAJAMAN BELOK
        duration: 0.35, // Berapa lama dia belok
        name: "Tikungan 5",
      },
    ];

    // =========================================
    // 2. SETUP DASAR
    // =========================================
    setSpawn(-1.14, 10, -2.53, 6.83);

    scaleParams.autoScale = false;
    if (carModel) carModel.scale.set(0.01, 0.01, 0.01);
    if (scaleParams) scaleParams.size = 0.01;

    lightingThemes.daylight();
    toggleCarLights(false);

    camera.near = 0.001;
    camera.updateProjectionMatrix();

    carSettings.autoDrive = false;
    carSettings.maxSpeed = 0.8;
    carSettings.acceleration = 0.01;
    carSettings.turnSpeed = 0.05;
    carSpeed = 0;

    // Status Sistem
    let currentTargetIndex = 0;
    let currentRotSpeed = 0;
    let stopTurnTime = 0; // Waktu kapan harus berhenti belok

    // =========================================
    // 3. LOGIKA EKSEKUSI
    // =========================================
    Director.loadScenario((delta, t) => {
      if (t < 1.0) {
        carSpeed = 0;
      } else {
        if (!carSettings.autoDrive) carSettings.autoDrive = true;

        // A. CEK APAKAH WAKTUNYA KEMBALI LURUS?
        // Jika waktu sekarang (t) sudah melewati batas waktu stop (stopTurnTime)
        // DAN kita sedang dalam mode belok (stopTurnTime > 0)
        if (stopTurnTime > 0 && t > stopTurnTime) {
          console.log("⏹️ SELESAI BELOK -> LURUS");
          steeringAngle = 0; // Luruskan setir
          currentRotSpeed = 0; // Stop putar body
          stopTurnTime = 0; // Reset timer
        }

        // B. CEK KOORDINAT START BELOK
        if (currentTargetIndex < TRACK_PATH.length) {
          const target = TRACK_PATH[currentTargetIndex];

          const carPos = new THREE.Vector2(carModel.position.x, carModel.position.z);
          const targetPos = new THREE.Vector2(target.x, target.z);
          const dist = carPos.distanceTo(targetPos);

          // Gunakan presisi tinggi (0.05)
          if (dist < 0.05) {
            console.log("▶️ MULAI BELOK:", target.name);

            // 1. Eksekusi Belok
            steeringAngle = target.turnVal;
            currentRotSpeed = target.rotSpeed;

            // 2. Set Kapan Harus Berhenti
            // Waktu Stop = Waktu Sekarang + Durasi yang diinginkan
            stopTurnTime = t + target.duration;

            // 3. Lanjut ke antrian berikutnya
            currentTargetIndex++;
          }
        }

        // C. ROTASI BODY (DENGAN PEREDAM)
        if (currentRotSpeed !== 0) {
          // 1. Hitung FPS Factor (Anti-Lag)
          const fpsFactor = delta / 0.0166;

          // 2. GLOBAL REDUCER (PENGATUR KEKUATAN)
          // Jika belokan terlalu drastis, KECILKAN angka ini.
          // 1.0 = Kekuatan Penuh
          // 0.6 = Kekuatan 60% (Lebih halus)
          const GLOBAL_POWER = 0.33;

          // 3. Terapkan Rumus
          carModel.rotation.y -= currentRotSpeed * fpsFactor * GLOBAL_POWER;
        }
      }

      // === KAMERA ===
      const distOffset = new THREE.Vector3(0.0, 0.04, -0.08);
      distOffset.applyQuaternion(carModel.quaternion);

      const worldCam = carModel.position.clone().add(distOffset);
      camera.position.lerp(worldCam, 0.2);

      const targetLook = carModel.position.clone();
      targetLook.y += 0.02;
      controls.target.lerp(targetLook, 0.2);
    });

    Director.play();
  });
}
function scene_ReefCoast() {
  console.log("🎬 Map: Reef & Coastal");
  coreLoadMap("reef_and_coastal_road.glb", () => {
    setSpawn(63, 15, 38, Math.PI * 2);

    scaleParams.autoScale = false;
    if (carModel) carModel.scale.set(0.5, 0.5, 0.5);
    if (scaleParams) scaleParams.size = 0.5;

    lightingThemes.clear(); // Laut cerah
  });
}

function scene_Highway() {
  console.log("🎬 Map: Highway");
  coreLoadMap("road__highway.glb", () => {
    setSpawn(0, 0.5, 0, 0);
    lightingThemes.daylight();
  });
}

function scene_Mestia() {
  console.log("🎬 Map: Road to Mestia");
  coreLoadMap("road_to_mestia_svaneti.glb", () => {
    setSpawn(0, 2, 0, 0);
    lightingThemes.foggy(); // Pegunungan berkabut
  });
}

function scene_TreesRoad() {
  console.log("🎬 Map: Road with Trees");
  coreLoadMap("road_with_trees.glb", () => {
    setSpawn(0, 0.5, 0, 0);
    lightingThemes.sunset(); // Bagus untuk efek cahaya sela pohon
  });
}

function scene_TunnelRoad() {
  console.log("🎬 Map: Tunnel Road");
  coreLoadMap("tunnel_road.glb", () => {
    setSpawn(0, 1, 0, 0);
    lightingThemes.night(); // Tunnel harus gelap
    // Nyalakan lampu mobil otomatis jika fitur ada
  });
}

function scene_TestMode() {
  coreLoadMap("test", () => {
    setSpawn(0, 0, 0, 0);
    lightingThemes.daylight();
    // Tidak ada cinematic, langsung main
  });
}

function scene_BridgeDesign() {
  console.log("🎬 Map 1: Bridge (Looping Mode)");

  if (typeof AutoShowcase !== "undefined") AutoShowcase.active = false;

  coreLoadMap("bridge_design.glb", () => {
    // 1. Setup Awal
    setSpawn(-190.02, 6.0, 6.39, 2.02);
    lightingThemes.daylight();
    
    // Setup Shadow Bridge
    lightingConfig.shadowRange = 50; 
    lightingConfig.targetX = -190;
    lightingConfig.targetZ = 0;
    lightingConfig.shadowBias =  0;
    lightingConfig.dirPositionX = 50;
    lightingConfig.dirPositionY = 150; // Tinggi biar bayangan tajam ke bawah
    lightingConfig.dirPositionZ = 50;

    lightingConfig.ambientIntensity = 0.4;
    lightingConfig.dirIntensity = 2.5; // Naikkan biar "nendang"


    updateLighting(); 

    // Trigger Points
    const POINT_START_TURN = new THREE.Vector3(-25.26, 10.85, -73.21);
    const POINT_END_TURN = new THREE.Vector3(185.24, 13.55, -90.06);
    const POINT_STOP = new THREE.Vector3(526.59, 5.9, -6.97);
    const SKY_LINK_POS = new THREE.Vector3(0, 40, -10);

    // Initial Car Settings
    carSettings.autoDrive = false;
    carSettings.maxSpeed = 1.4;
    carSettings.acceleration = 0.02;
    carSettings.turnSpeed = 0.05;
    carSpeed = 0;
    toggleCarLights(true);

    // State Logic
    let isTurning = false;
    let hasFinishedTurn = false;
    
    Director.loadScenario((delta, t) => {
      const DURATION = 25.0; // Durasi total satu putaran

      // 🔥 LOGIKA LOOPING (Agar mobil tidak mati saat setting GUI) 🔥
      if (t > DURATION) {
        // Reset Waktu Director
        Director.startTime = clock.getElapsedTime();
        // Reset Posisi Mobil
        setSpawn(-190.02, 6.0, 6.39, 2.02);
        // Reset Logic State
        isTurning = false;
        hasFinishedTurn = false;
        carSpeed = 0;
        console.log("🔄 Replay Cinematic Loop...");
        return;
      }

      // === A. LOGIKA MOBIL ===
      const distStart = carModel.position.distanceTo(POINT_START_TURN);
      const distEnd = carModel.position.distanceTo(POINT_END_TURN);

      // Trigger Belok
      if (!isTurning && !hasFinishedTurn && distStart < 15.0) {
        isTurning = true;
      }
      // Trigger Lurus
      if (isTurning && distEnd < 15.0) {
        isTurning = false;
        hasFinishedTurn = true;
      }

      if (t < 1.5) {
        carSpeed = 0; // Delay start
      } else {
        if (!carSettings.autoDrive) carSettings.autoDrive = true;
        
        if (isTurning) {
           carModel.rotation.y -= 0.0022; // Belok halus
           steeringAngle = 0.12;
        } else {
           steeringAngle = 0; // Lurus
        }
      }

      // === B. KAMERA ===
      let relOffset, lookTarget;

      // Shot 1: Low Angle (0-4s)
      if (t < 4.0) {
        relOffset = new THREE.Vector3(2.0, 1.2, -4.5);
        relOffset.y += Math.sin(t * 2) * 0.02;
        lookTarget = carModel.position.clone();
        lookTarget.y += 0.5;
      }
      // Shot 2: Swing Drone (4-10s)
      else if (t >= 4.0 && t < 10.0) {
        const progress = (t - 4.0) / 6.0;
        const smoothP = THREE.MathUtils.smoothstep(progress, 0, 1);
        const x = THREE.MathUtils.lerp(2.0, -11.5, smoothP);
        const y = THREE.MathUtils.lerp(1.2, 3.0, smoothP);
        const z = THREE.MathUtils.lerp(-4.5, -1.0, smoothP);
        relOffset = new THREE.Vector3(x, y, z);
        lookTarget = carModel.position.clone();
        lookTarget.y += THREE.MathUtils.lerp(0.5, 0.8, smoothP);
      }
      // Shot 3: Sky Lift (10s+)
      else {
        const progress = (t - 10.0) / 10.0;
        const smoothP = THREE.MathUtils.smoothstep(progress, 0, 1);
        const x = THREE.MathUtils.lerp(-11.5, SKY_LINK_POS.x, smoothP);
        const y = THREE.MathUtils.lerp(3.0, SKY_LINK_POS.y, smoothP);
        const z = THREE.MathUtils.lerp(-1.0, SKY_LINK_POS.z, smoothP);
        relOffset = new THREE.Vector3(x, y, z);
        lookTarget = carModel.position.clone();
      }

      const worldCam = relOffset.applyMatrix4(carModel.matrixWorld);
      camera.position.lerp(worldCam, 0.2);
      controls.target.lerp(lookTarget, 0.2);
    });

    Director.play();
  });
}
function scene_City() {
  console.log("🎬 Map: City (With Cinematic Transition)");

  if (typeof AutoShowcase !== "undefined") AutoShowcase.active = false;

  // ============================================================
  // 1. SETUP FADE OVERLAY (Layar Hitam Khusus Scene Ini)
  // ============================================================
  let fadeOverlay = document.getElementById("cinematic-fade-overlay");

  if (!fadeOverlay) {
    fadeOverlay = document.createElement("div");
    fadeOverlay.id = "cinematic-fade-overlay";
    fadeOverlay.style.position = "fixed";
    fadeOverlay.style.top = "0";
    fadeOverlay.style.left = "0";
    fadeOverlay.style.width = "100vw";
    fadeOverlay.style.height = "100vh";
    fadeOverlay.style.backgroundColor = "black";
    fadeOverlay.style.opacity = "0";
    fadeOverlay.style.pointerEvents = "none";
    fadeOverlay.style.zIndex = "9999";
    fadeOverlay.style.transition = "opacity 0.1s linear";
    document.body.appendChild(fadeOverlay);
  } else {
    fadeOverlay.style.opacity = "0";
  }

  coreLoadMap("city_for_my_game.glb", () => {
    // 2. POSISI SPAWN
    setSpawn(119.1, -9.35, -197.2, Math.PI / 10);

    lightingThemes.sunset();
    lightingConfig.shadowRange = 80; 
    
    // Posisi Matahari (Offset dari mobil)
    // Y rendah (30-50) = Bayangan Panjang (Khas Sunset)
    lightingConfig.dirPositionY = 40; 
    // X & Z menentukan arah bayangan jatuh ke mana
    lightingConfig.dirPositionX = 120; 
    lightingConfig.dirPositionZ = 50;
    updateLighting(); // Apply changes
    toggleCarLights(false);
    // 3. SETTING MOBIL
    carSettings.autoDrive = false;
    carSettings.maxSpeed = 1.0;
    carSettings.acceleration = 0.015;
    carSettings.turnSpeed = 0.03;
    carSpeed = 0;

    // Pastikan lampu mati dulu (nanti dinyalakan startEngine)
    // updateCarLights(false, false);

    // --- ANTI-GLITCH CAMERA START ---
    if (carModel) {
      const startAngle = 0.5;
      const startDist = 5;
      const offsetX = Math.sin(startAngle) * startDist;
      const offsetZ = Math.cos(startAngle) * startDist;
      camera.position.set(carModel.position.x + offsetX, carModel.position.y + 1.5, carModel.position.z + offsetZ);
      controls.target.copy(carModel.position);
      camera.updateProjectionMatrix();
    }

    // Variabel lokal
    let safeSpot = null;
    let transitionTriggered = false; // <--- FLAG PENTING AGAR TIDAK LOOPING

    // 4. SKENARIO SUTRADARA
    Director.loadScenario((delta, t) => {
      // ====================================================
      // 🔥 LOGIKA PINDAH SCENE (AUTO SWITCH) 🔥
      // ====================================================
      if (t > 22.0) {
        carSpeed = 0;

        // Cek agar kode ini hanya jalan 1 kali saja
        if (!transitionTriggered) {
          transitionTriggered = true;
          console.log("🎬 City Scene Selesai. Pindah ke Bridge...");

          // 1. Sembunyikan overlay scene ini (agar tidak menumpuk dengan global transition)
          if (fadeOverlay) fadeOverlay.style.opacity = "0";

          // 2. Panggil Global Transition ke Map Berikutnya
          triggerTransition(() => {
            loadMap("2. bridge_design");
          });
        }
        return;
      }

      // ===============================================
      // A. LOGIKA MOBIL (Jalan -> Fade -> Ngerem)
      // ===============================================

      // FASE JALAN (Detik 3.0 s/d 16.0)
      if (t > 3.0 && t < 16.0) {
        if (!carSettings.autoDrive) {
          // Panggil startEngine() agar lampu nyala realistis
          carSettings.autoDrive = true;
          toggleCarLights(true);
        }
      }
      // FASE NGEREM (Detik 16.0++)
      else if (t >= 16.0) {
        carSettings.autoDrive = false;
        carSpeed *= 0.9; // Ngerem dalam kegelapan
      }

      // LOGIKA BELOK
      if (t > 3.5 && t < 4.0) {
        const turnPower = THREE.MathUtils.smoothstep(t, 3.5, 4.0);
        carModel.rotation.y -= 0.025 * turnPower;
        steeringAngle = -0.5 * turnPower;
      } else if (t >= 4.0) {
        steeringAngle += (0 - steeringAngle) * 0.1;
      }

      // ===============================================
      // B. LOGIKA TRANSISI (FADE TO BLACK)
      // ===============================================
      // Mulai gelap: Detik 13.0, Gelap total: Detik 16.0
      const fadeStart = 13.0;
      const fadeDuration = 3.0;

      if (t > fadeStart) {
        const progress = (t - fadeStart) / fadeDuration;
        const opacity = Math.min(Math.max(progress, 0), 1);

        if (fadeOverlay) fadeOverlay.style.opacity = opacity;
      } else {
        if (fadeOverlay) fadeOverlay.style.opacity = 0;
      }

      // ===============================================
      // C. LOGIKA KAMERA
      // ===============================================

      // SHOT 1: INTRO (0s - 3s)
      if (t < 3.0) {
        const angle = t * 0.2;
        const dist = 5.5;
        const camX = carModel.position.x + Math.sin(angle + 0.5) * dist;
        const camZ = carModel.position.z + Math.cos(angle + 0.5) * dist;
        camera.position.set(camX, carModel.position.y + 1.5, camZ);
        controls.target.copy(carModel.position);
      }

      // SHOT 2: WHEEL ACTION (3s - 8s)
      else if (t >= 3.0 && t < 8.0) {
        const relOffset = new THREE.Vector3(2.5, 0.5, 1.5);
        const worldCam = relOffset.applyMatrix4(carModel.matrixWorld);
        worldCam.y += Math.random() * 0.01;
        camera.position.lerp(worldCam, 0.1);

        const lookTarget = carModel.position.clone();
        const forward = new THREE.Vector3(0, 0, 5).applyQuaternion(carModel.quaternion);
        lookTarget.add(forward);
        controls.target.lerp(lookTarget, 0.1);
      }

      // SHOT 3: LOW FRONT REVEAL (8s - 12s)
      else if (t >= 8.0 && t < 12.0) {
        const swingDuration = 4.0;
        const rawProgress = (t - 8.0) / swingDuration;
        const smoothProgress = THREE.MathUtils.smoothstep(rawProgress, 0, 1);

        const currentRadius = THREE.MathUtils.lerp(3.0, 8.5, smoothProgress);
        const currentAngle = THREE.MathUtils.lerp(Math.PI / 2, 0.05, smoothProgress);

        const localX = Math.sin(currentAngle) * currentRadius;
        const localZ = Math.cos(currentAngle) * currentRadius;
        const localY = THREE.MathUtils.lerp(0.5, 0.6, smoothProgress);

        const relOffset = new THREE.Vector3(localX, localY, localZ);
        const worldCam = relOffset.applyMatrix4(carModel.matrixWorld);

        camera.position.lerp(worldCam, 0.1);

        const targetX = THREE.MathUtils.lerp(0.8, 0.0, smoothProgress);
        const targetY = THREE.MathUtils.lerp(0.35, 0.4, smoothProgress);
        const targetZ = THREE.MathUtils.lerp(1.4, 3.5, smoothProgress);

        const localTarget = new THREE.Vector3(targetX, targetY, targetZ);
        const worldTarget = localTarget.applyMatrix4(carModel.matrixWorld);

        controls.target.lerp(worldTarget, 0.3);
      }

      // SHOT 4: "SIDEWALK ESCAPE" & TRANSISI (12s - 22s)
      else {
        // --- LOGIKA MINGGIR KE TROTOAR ---
        if (!safeSpot) {
          safeSpot = camera.position.clone();

          const rightVec = new THREE.Vector3(1, 0, 0);
          rightVec.applyQuaternion(camera.quaternion);
          rightVec.y = 0;
          rightVec.normalize();
          rightVec.multiplyScalar(7.0);

          safeSpot.add(rightVec);
          safeSpot.y = 2.0;
        }

        camera.position.lerp(safeSpot, 0.08);

        if (carModel) {
          controls.target.lerp(carModel.position, 0.1);
        }
      }
    });

    Director.play();
  });
}

function scene_DesertRoad() {
  coreLoadMap("desert_road_segment_scan.glb", () => {
    setSpawn(0, 500, 0, 0);
    lightingThemes.daylight();
    // Tidak ada cinematic, langsung main
  });
}

// --- REGISTRY  MAP---
const sceneRegistry = {
  "1. City": scene_City,
  "2. bridge_design": scene_BridgeDesign,
  "3. American Curve": scene_AmericanCurve,
  "4. American Underpass": scene_AmericanUnderpass,
  "5, Coast Road & Rocks": scene_CoastRoadAndRocks,
  "6. Reef & Coastal": scene_ReefCoast,
  "7. Coast Tunnel": scene_CoastTunnel,
  "Hokkaido Snowfield": scene_HokkaidoSnow,
  "Mountain Road": scene_MountainRoad,
  Highway: scene_Highway,
  "Road to Mestia": scene_Mestia,
  "Road with Trees": scene_TreesRoad,
  "Tunnel Road": scene_TunnelRoad,

  "Desert road": scene_DesertRoad,
  "Test Mode (Debug)": scene_TestMode,
};

function loadMap(mapName) {
  const func = sceneRegistry[mapName];
  if (func) func();
  else console.error("Scene not found:", mapName);
}

// ==========================================
// 9. UTILS (CREATE TEST MODEL & AUTO SCALE)
// ==========================================

function createTestModel() {
  console.log("📦 Membuat test model...");
  const testModel = new THREE.Group();

  // Road
  const roadGeometry = new THREE.PlaneGeometry(40, 300);
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.8,
    metalness: 0.2,
  });
  const road = new THREE.Mesh(roadGeometry, roadMaterial);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  testModel.add(road);

  // Markings
  const lineGeometry = new THREE.PlaneGeometry(0.5, 300);
  const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });
  const line = new THREE.Mesh(lineGeometry, lineMaterial);
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.01;
  testModel.add(line);

  // Grid
  const gridHelper = new THREE.GridHelper(300, 60, 0x888888, 0x444444);
  gridHelper.position.y = 0.01;
  testModel.add(gridHelper);

  currentMapModel = testModel;
  scene.add(currentMapModel);
}

function detectRoadWidth() {
  if (!carModel || !currentMapModel) return 0;

  const samplePoints = 5;
  let totalWidth = 0;
  let validSamples = 0;

  for (let i = 0; i < samplePoints; i++) {
    // Ambil sampel di depan/belakang mobil
    const offsetZ = i * 2 - (samplePoints * 2) / 2;
    const samplePos = carModel.position.clone();
    samplePos.z += offsetZ;

    // Deteksi Sisi Kiri
    const leftRayOrigin = samplePos.clone();
    leftRayOrigin.x -= 50; // Mulai dari jauh di kiri
    leftRayOrigin.y += 20;

    // Kita scan area bawah
    raycaster.set(leftRayOrigin, downVector);
    // Cari titik temu pertama dengan map
    const leftIntersects = raycaster.intersectObject(currentMapModel, true);

    // Deteksi Sisi Kanan
    const rightRayOrigin = samplePos.clone();
    rightRayOrigin.x += 50; // Mulai dari jauh di kanan
    rightRayOrigin.y += 20;

    raycaster.set(rightRayOrigin, downVector);
    const rightIntersects = raycaster.intersectObject(currentMapModel, true);

    // Jika dua-duanya kena tanah/jalan
    if (leftIntersects.length > 0 && rightIntersects.length > 0) {
      const leftPoint = leftIntersects[0].point;
      const rightPoint = rightIntersects[0].point;

      // Hitung jarak (Lebar jalan perkiraan)
      // Note: Ini logika sederhana, mengasumsikan map di bawah mobil adalah jalan
      const width = Math.abs(leftPoint.x - rightPoint.x);

      // Filter hasil yang aneh (misal terlalu lebar > 100m)
      if (width < 50) {
        totalWidth += width;
        validSamples++;
      }
    }
  }

  return validSamples > 0 ? totalWidth / validSamples : 0;
}

function checkCollision(currentScale) {
  if (!currentMapModel || !carModel) return false;

  // 1. Tentukan arah deteksi (Maju atau Mundur tergantung speed)
  // Jika speed positif (maju), ray ke depan (Z positif). Jika mundur, ray ke belakang.
  // Note: translateZ di three.js biasanya maju ke arah Z positif relatif object
  const direction = new THREE.Vector3(0, 0, carSpeed > 0 ? 1 : -1);
  direction.applyQuaternion(carModel.quaternion); // Sesuaikan dengan rotasi mobil

  // 2. Tentukan Titik Awal Ray (Bumper Mobil)
  const rayOrigin = carModel.position.clone();
  // Naikkan sedikit (y) agar tidak kena aspal/polisi tidur, sesuaikan dengan scale
  rayOrigin.y += 0.5 * currentScale;

  // 3. Setup Raycaster
  // Kita gunakan raycaster global yg sudah ada
  raycaster.set(rayOrigin, direction);

  // 4. Cek Tabrakan dengan Map
  // Kita cek objek apa saja yang ada di depan
  const intersects = raycaster.intersectObject(currentMapModel, true);

  // 5. Logika Tabrakan
  // Jarak aman tabrakan (sesuaikan dengan scale mobil)
  const safeDistance = 2.5 * currentScale;

  if (intersects.length > 0) {
    const distance = intersects[0].distance;

    // Jika jarak objek lebih dekat dari jarak aman
    if (distance < safeDistance) {
      console.warn("💥 CRASH DETECTED!");
      return true; // Ada tabrakan
    }
  }

  return false; // Aman
}

function autoScaleCarForMap() {
  if (!carModel || !currentMapModel) return;

  console.log("📏 Auto-scaling mobil untuk map...");

  const roadWidth = detectRoadWidth();

  // Default fallback jika gagal deteksi
  let finalScale = 1.0;

  if (roadWidth > 0) {
    const optimalCarWidth = 2.0; // Lebar mobil rata-rata
    const optimalRoadWidth = 4.0; // Lebar jalur standar

    // Rumus: Sesuaikan ukuran mobil berdasarkan rasio lebar jalan yang terdeteksi
    // Faktor 1.2 adalah adjustment agar mobil tidak terlalu kecil
    const scaleFactor = (roadWidth / optimalRoadWidth) * 0.8;

    const minScale = 0.3;
    const maxScale = 3.0;
    finalScale = THREE.MathUtils.clamp(scaleFactor, minScale, maxScale);

    console.log(`✅ Deteksi Jalan: ${roadWidth.toFixed(2)}m -> Scale: ${finalScale.toFixed(2)}x`);
  } else {
    console.warn("⚠️ Gagal deteksi lebar jalan, menggunakan scale default.");
  }

  // Terapkan Scale
  carModel.scale.set(finalScale, finalScale, finalScale);

  // Update GUI agar slider ikut berubah
  if (scaleParams) scaleParams.size = finalScale;
}

// ==========================================
// 10. CAMERA CONFIGURATION SYSTEM
// ==========================================

const cameraConfig = {
  distance: 12,
  height: 6,
  lookAtY: 0,
  fov: 60,
  damping: 0.1,
  collisionEnabled: true,
  collisionOffset: 2,
  minDistance: 2,
  maxDistance: 100,
  minPolarAngle: 0,
  maxPolarAngle: Math.PI,
  enablePan: true,
  enableRotate: true,
  enableZoom: true,
};

function updateOrbitControls() {
  controls.minDistance = cameraConfig.minDistance;
  controls.maxDistance = cameraConfig.maxDistance;
  controls.minPolarAngle = cameraConfig.minPolarAngle;
  controls.maxPolarAngle = cameraConfig.maxPolarAngle;
  controls.enablePan = cameraConfig.enablePan;
  controls.enableRotate = cameraConfig.enableRotate;
  controls.enableZoom = cameraConfig.enableZoom;
}
updateOrbitControls();

// ==========================================
// 11. LIGHTING CONFIGURATION SYSTEM
// ==========================================

const lightingConfig = {
  ambientIntensity: 1.0,
  ambientColor: "#ffffff",
  dirIntensity: 2.0,
  dirColor: "#ffffff",
  dirPositionX: 50,
  dirPositionY: 100,
  dirPositionZ: 50,
  hemisphereIntensity: 0.5,
  skyColor: "#87CEEB",
  groundColor: "#8B4513",
  spotIntensity: 1.0,
  spotColor: "#ffffff",
  spotDistance: 200,
  spotAngle: 30,
  spotPenumbra: 0.5,
  spotDecay: 2,
  pointIntensity: 0.5,
  pointColor: "#ff6600",
  pointDistance: 50,
  
  // --- SHADOW SETTINGS (UPDATED) ---
  shadowEnabled: true,
  shadowMapSize: 4096,
  shadowBias: -0.0005, // Bias sedikit negatif agar tidak ada artifacts
  shadowRadius: 1,
  shadowRange: 50,     // Luas area bayangan
  targetX: 0,           // Fokus cahaya X
  targetZ: 0,           // Fokus cahaya Z
  shadowAutoUpdate: true,
  theme: "daylight",
};

function updateLighting() {
  // 1. Update Warna & Intensitas
  ambientLight.intensity = lightingConfig.ambientIntensity;
  ambientLight.color.set(lightingConfig.ambientColor);
  
  dirLight.intensity = lightingConfig.dirIntensity;
  dirLight.color.set(lightingConfig.dirColor);

  // Note: Posisi lampu TIDAK DIATUR disini lagi, tapi di updateSunPosition()

  hemisphereLight.intensity = lightingConfig.hemisphereIntensity;
  hemisphereLight.color.set(lightingConfig.skyColor);
  hemisphereLight.groundColor.set(lightingConfig.groundColor);
  
  spotLight.intensity = lightingConfig.spotIntensity;
  spotLight.color.set(lightingConfig.spotColor);
  spotLight.distance = lightingConfig.spotDistance;
  spotLight.angle = THREE.MathUtils.degToRad(lightingConfig.spotAngle);
  spotLight.penumbra = lightingConfig.spotPenumbra;
  spotLight.decay = lightingConfig.spotDecay;
  
  pointLight.intensity = lightingConfig.pointIntensity;
  pointLight.color.set(lightingConfig.pointColor);
  pointLight.distance = lightingConfig.pointDistance;
  
  // ==========================================
  // 🔥 SHADOW QUALITY SETTINGS 🔥
  // ==========================================
  dirLight.castShadow = lightingConfig.shadowEnabled;
  spotLight.castShadow = lightingConfig.shadowEnabled;
  renderer.shadowMap.enabled = lightingConfig.shadowEnabled;
  
  // Tipe Shadow (Soft)
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; 

  // Bias & Resolusi
  dirLight.shadow.bias = lightingConfig.shadowBias; 
  dirLight.shadow.normalBias = 0.02; 
  dirLight.shadow.radius = lightingConfig.shadowRadius;
  dirLight.shadow.mapSize.width = 4096;
  dirLight.shadow.mapSize.height = 4096;

  // Ukuran Kamera Bayangan (Diatur oleh GUI Area Size)
  const range = lightingConfig.shadowRange; 
  
  dirLight.shadow.camera.left = -range;
  dirLight.shadow.camera.right = range;
  dirLight.shadow.camera.top = range;
  dirLight.shadow.camera.bottom = -range;
  
  // Far Plane
  dirLight.shadow.camera.far = 5000; 
  dirLight.shadow.camera.near = 0.5;
  
  dirLight.shadow.camera.updateProjectionMatrix();
  
  // Helper Visual
  if (!window.shadowHelper) {
     window.shadowHelper = new THREE.CameraHelper(dirLight.shadow.camera);
     scene.add(window.shadowHelper);
  }
}
// Panggil sekali di awal
updateLighting();

function updateSunPosition() {
  if (!dirLight) return;

  let centerPos = new THREE.Vector3();

  // --- LOGIKA UTAMA ---
  if (lightingConfig.shadowAutoUpdate && carModel) {
      // MODE AUTO: Fokus ke Mobil
      centerPos.copy(carModel.position);
      
      // Update angka di GUI slider agar ikut bergerak (Feedback Visual)
      lightingConfig.targetX = centerPos.x;
      lightingConfig.targetZ = centerPos.z;
  } else {
      // MODE MANUAL: Fokus ke angka Slider GUI
      centerPos.set(lightingConfig.targetX, 0, lightingConfig.targetZ);
  }

  // 1. Pindahkan Lampu (Titik Fokus + Offset Langit)
  dirLight.position.set(
      centerPos.x + lightingConfig.dirPositionX,
      centerPos.y + lightingConfig.dirPositionY,
      centerPos.z + lightingConfig.dirPositionZ
  );

  // 2. Arahkan Target Lampu ke Titik Fokus
  dirLight.target.position.copy(centerPos);
  dirLight.target.updateMatrixWorld();

  // 3. Update Kotak Kuning (Helper)
  if (window.shadowHelper) window.shadowHelper.update();
}

// Themes
const lightingThemes = {
  daylight: () => {
    // 1. RESET INTENSITAS
    lightingConfig.ambientIntensity = 1.0;
    lightingConfig.dirIntensity = 2.0; // Naikkan biar "nendang"
    
    // 2. RESET WARNA (INI YANG HILANG SEBELUMNYA)
    // Harus dikembalikan ke Putih, kalau tidak dia pakai warna sisa dari scene Sunset
    lightingConfig.ambientColor = "#ffffff"; 
    lightingConfig.dirColor = "#ffffff";
    
    // 3. Environment
    lightingConfig.skyColor = "#87CEEB";
    lightingConfig.groundColor = "#8B4513";
    
    scene.background = new THREE.Color(0x87ceeb);
    if (scene.fog) scene.fog = null;


    
    // Terapkan perubahan ke Three.js
    updateLighting();
    
    // Update GUI (Opsional, biar slider warnanya ikut berubah putih di panel)
    // Karena lil-gui membaca object reference, biasanya dia auto-update saat di-hover/klik, 
    // tapi secara visual di scene pasti sudah benar.
  },
  
  sunset: () => {
    lightingConfig.ambientIntensity = 0.8;
    lightingConfig.ambientColor = "#ffcc99"; // Mengubah warna jadi oranye
    lightingConfig.dirIntensity = 1.5;
    lightingConfig.dirColor = "#ff6600";     // Mengubah warna jadi merah
    lightingConfig.skyColor = "#ff9966";
    scene.background = new THREE.Color(0xff9966);
    if (scene.fog) scene.fog = null;
    updateLighting();
  },

  night: () => {
    lightingConfig.ambientIntensity = 0.2;
    lightingConfig.ambientColor = "#333366"; // Biru gelap
    lightingConfig.dirIntensity = 0.3;
    lightingConfig.dirColor = "#ffffff";     // Reset directional ke putih (atau biru muda)
    lightingConfig.skyColor = "#000033";
    scene.background = new THREE.Color(0x000033);
    if (scene.fog) scene.fog = null;
    updateLighting();
  },

  foggy: () => {
    lightingConfig.ambientIntensity = 0.6;
    lightingConfig.ambientColor = "#ffffff"; // Reset putih
    lightingConfig.dirIntensity = 0.8;
    lightingConfig.dirColor = "#ffffff";     // Reset putih
    
    scene.fog = new THREE.Fog(0xaaaaaa, 10, 100);
    scene.background = new THREE.Color(0xaaaaaa);
    updateLighting();
  },

  clear: () => {
    scene.fog = null;
    lightingThemes.daylight(); // Reuse logika daylight yang sudah diperbaiki
  },
};

// ==========================================
// 12. GUI CONTROL PANEL
// ==========================================

const gui = new GUI({ title: "🎬 DIRECTOR SETTINGS", width: 380 });

// Map Selector (UPDATED)
const mapFolder = gui.addFolder("🗺️ Map Selector");
const mapControls = {
  selectedMap: "Test Mode (Debug)",
  loadMap: function () {
    loadMap(this.selectedMap);
  },
};
// Menggunakan keys dari sceneRegistry agar dinamis
mapFolder.add(mapControls, "selectedMap", Object.keys(sceneRegistry)).onChange(() => mapControls.loadMap());
mapFolder.add(mapControls, "loadMap").name("🔄 Load Map Sekarang");
mapFolder.open();

// Car Controls
const carFolder = gui.addFolder("🏎️ Car Control");
carFolder.add(carSettings, "followCamera").name("🎥 Camera Follow");
carFolder.add(carSettings, "autoDrive").name("🤖 Auto Pilot");
carFolder.add(carSettings, "maxSpeed", 0.1, 3.0).name("🚀 Max Speed").step(0.1);
carFolder.add(carSettings, "turnSpeed", 0.01, 0.1).name("🔄 Turn Speed").step(0.01);
carFolder.add({ getCoords: checkCoordinates }, "getCoords").name("📍 Cek Koordinat (P)");

// Scale
const scaleParams = { size: 1, autoScale: true, lastAutoScale: 1 };
carFolder
  .add(scaleParams, "size", 0.1, 20)
  .name("📏 Manual Scale")
  .step(0.1)
  .onChange((val) => {
    if (carModel && !scaleParams.autoScale) carModel.scale.set(val, val, val);
  });
carFolder.add(scaleParams, "autoScale").name("⚡ Auto Scale");

// Reset Car (UPDATED)
carFolder
  .add(
    {
      resetCar: () => {
        if (carModel) {
          carModel.position.set(currentSpawnInfo.x, currentSpawnInfo.y, currentSpawnInfo.z);
          carModel.rotation.set(0, currentSpawnInfo.rot, 0);
          carSpeed = 0;
          steeringAngle = 0;
          if (scaleParams.autoScale && currentMapModel) setTimeout(() => autoScaleCarForMap(), 100);
        }
      },
    },
    "resetCar"
  )
  .name("🔄 Reset Car Position");
carFolder.open();

// Camera Presets
const camPresets = {
  default: () => {
    cameraConfig.distance = 12;
    cameraConfig.height = 6;
    cameraConfig.fov = 60;
    cameraConfig.lookAtY = 0;
  },
  topDown: () => {
    cameraConfig.distance = 1;
    cameraConfig.height = 30;
    cameraConfig.fov = 60;
    cameraConfig.lookAtY = -10;
  },
  racing: () => {
    cameraConfig.distance = 6;
    cameraConfig.height = 2;
    cameraConfig.fov = 80;
    cameraConfig.lookAtY = 1;
  },
  cinematic: () => {
    cameraConfig.distance = 20;
    cameraConfig.height = 3;
    cameraConfig.fov = 40;
    cameraConfig.lookAtY = 0;
  },
  driverView: () => {
    cameraConfig.distance = 3;
    cameraConfig.height = 1.5;
    cameraConfig.fov = 70;
    cameraConfig.lookAtY = 1;
  },
  wheelCinematic: () => {
    // Kita gunakan Director supaya kamera bisa dikontrol manual sepenuhnya per frame
    Director.playScenario((delta, time) => {
      if (!carModel) return;

      // 1. Tentukan Posisi Kamera (Di samping depan kiri mobil, rendah)
      // X=2.0 (Geser kanan), Y=0.4 (Rendah), Z=1.2 (Dekat roda depan)
      const relativeCamPos = new THREE.Vector3(2.5, 0.5, 1.2);

      // Konversi posisi relatif ke posisi dunia (mengikuti rotasi mobil)
      const worldCamPos = relativeCamPos.applyMatrix4(carModel.matrixWorld);

      // 2. Tentukan Titik Fokus (Ke arah Roda Depan Kanan)
      // Kita arahkan sedikit ke bawah agar velg terlihat jelas
      const relativeTarget = new THREE.Vector3(0.8, 0.35, 1.4);
      const worldTarget = relativeTarget.applyMatrix4(carModel.matrixWorld);

      // 3. Update Kamera
      // Gunakan lerp agar pergerakan kamera halus (sedikit delay biar ada kesan berat)
      camera.position.lerp(worldCamPos, 0.1);
      camera.lookAt(worldTarget);

      // 4. Efek Kecepatan (FOV berubah saat ngebut)
      // Semakin cepat, FOV semakin lebar
      const baseFov = 50;
      const speedFactor = Math.abs(carSpeed) * 50;
      camera.fov = baseFov + speedFactor;
      camera.updateProjectionMatrix();
    });

    console.log("🎥 Mode: Wheel Cinematic Shot Activated");
  },
};

const camFolder = gui.addFolder("🎥 Camera Director");

const directorFolder = camFolder.addFolder("🎬 Action");
directorFolder.add(Director, "play").name("▶ Play Cinematic");
directorFolder.add(Director, "stop").name("⏹ Stop / Manual");
directorFolder.open();
const presetFolder = camFolder.addFolder("📸 Camera Presets");
presetFolder.add(camPresets, "default").name("🎯 Normal View");
presetFolder.add(camPresets, "topDown").name("🛰️ Top Down");
presetFolder.add(camPresets, "racing").name("🏁 Racing");
presetFolder.add(camPresets, "cinematic").name("🎬 Cinematic");
presetFolder.add(camPresets, "driverView").name("👨‍✈️ Driver View");
presetFolder.add(camPresets, "wheelCinematic").name("🛞 Wheel Shot (Cinematic)");

const followCamFolder = camFolder.addFolder("📡 Follow Camera");
followCamFolder.add(carSettings, "followCamera").name("Enabled");
followCamFolder.add(cameraConfig, "distance", 2, 50).name("Distance").step(1);
followCamFolder.add(cameraConfig, "height", 1, 30).name("Height").step(1);
followCamFolder.add(cameraConfig, "lookAtY", -5, 10).name("LookAt Y").step(0.5);
// Removed Roll control to prevent confusion
followCamFolder.add(cameraConfig, "fov", 30, 120).name("Field of View").step(5);
followCamFolder.add(cameraConfig, "damping", 0.01, 1.0).name("Smoothness").step(0.01);
followCamFolder.add(cameraConfig, "collisionEnabled").name("Collision Avoidance");
followCamFolder.add(cameraConfig, "collisionOffset", 1, 10).name("Collision Offset").step(0.5);

// Orbit Controls
const orbitFolder = camFolder.addFolder("🔄 Orbit Controls");
orbitFolder.add(cameraConfig, "enableRotate").name("Enable Rotation");
orbitFolder.add(cameraConfig, "enableZoom").name("Enable Zoom");
orbitFolder.add(cameraConfig, "enablePan").name("Enable Pan");
orbitFolder.add(cameraConfig, "minDistance", 1, 50).name("Min Distance").step(1);
orbitFolder.add(cameraConfig, "maxDistance", 10, 200).name("Max Distance").step(10);
camFolder.open();

// Lighting
const lightFolder = gui.addFolder("💡 Lighting System");
// Ambient Light
const ambientFolder = lightFolder.addFolder("🌤️ Ambient Light");
ambientFolder.add(lightingConfig, "ambientIntensity", 0, 3).name("Intensity").step(0.1).onChange(updateLighting);
ambientFolder.addColor(lightingConfig, "ambientColor").name("Color").onChange(updateLighting);

// Directional Light
const dirFolder = lightFolder.addFolder("☀️ Directional Light");
dirFolder.add(lightingConfig, "dirIntensity", 0, 5).name("Intensity").step(0.1).onChange(updateLighting);
dirFolder.addColor(lightingConfig, "dirColor").name("Color").onChange(updateLighting);
dirFolder.add(lightingConfig, "dirPositionX", -200, 200).name("Position X").step(10).onChange(updateLighting);
dirFolder.add(lightingConfig, "dirPositionY", -200, 200).name("Position Y").step(10).onChange(updateLighting);
dirFolder.add(lightingConfig, "dirPositionZ", -200, 200).name("Position Z").step(10).onChange(updateLighting);

// Hemisphere Light
const hemiFolder = lightFolder.addFolder("🌎 Hemisphere Light");
hemiFolder.add(lightingConfig, "hemisphereIntensity", 0, 2).name("Intensity").step(0.1).onChange(updateLighting);
hemiFolder.addColor(lightingConfig, "skyColor").name("Sky Color").onChange(updateLighting);
hemiFolder.addColor(lightingConfig, "groundColor").name("Ground Color").onChange(updateLighting);

// Spot Light
const spotFolder = lightFolder.addFolder("🔦 Spot Light");
spotFolder.add(lightingConfig, "spotIntensity", 0, 5).name("Intensity").step(0.1).onChange(updateLighting);
spotFolder.addColor(lightingConfig, "spotColor").name("Color").onChange(updateLighting);
spotFolder.add(lightingConfig, "spotDistance", 0, 500).name("Distance").step(10).onChange(updateLighting);
spotFolder.add(lightingConfig, "spotAngle", 1, 60).name("Angle").step(1).onChange(updateLighting);

// Shadows
const shadowFolder = lightFolder.addFolder("🌑 Shadows");
shadowFolder.add(lightingConfig, "shadowEnabled").name("Enabled").onChange(updateLighting);
shadowFolder.add(lightingConfig, "shadowMapSize", [512, 1024, 2048, 4096]).name("Quality").onChange(updateLighting);
shadowFolder.add(lightingConfig, "shadowBias", -0.001, 0.001).name("Bias").step(0.0001).onChange(updateLighting);
shadowFolder.add(lightingConfig, "shadowRadius", 0, 5).name("Softness").step(0.1).onChange(updateLighting);
shadowFolder.add(lightingConfig, "shadowRange", 50, 1000).name("Area Size (Frustum)").onChange(updateLighting);
shadowFolder.add(lightingConfig, "targetX", -1000, 1000).name("Focus X").onChange(updateLighting);
shadowFolder.add(lightingConfig, "targetZ", -1000, 1000).name("Focus Z").onChange(updateLighting);
shadowFolder.add(lightingConfig, "shadowAutoUpdate").name("⚡ Auto Follow Car");

// Lighting Themes
const themeFolder = lightFolder.addFolder("🎨 Lighting Themes");
themeFolder
  .add({ theme: "daylight" }, "theme", ["daylight", "sunset", "night", "foggy", "clear"])
  .name("Select Theme")
  .onChange((val) => lightingThemes[val]());

lightFolder.open();

const perfFolder = gui.addFolder("⚡ Performance");
perfFolder.add(renderer.shadowMap, "enabled").name("Shadows");
perfFolder
  .add(renderer.shadowMap, "type", [THREE.BasicShadowMap, THREE.PCFShadowMap, THREE.PCFSoftShadowMap])
  .name("Shadow Type")
  .onChange((val) => {
    renderer.shadowMap.type = val;
  });

perfFolder
  .add({ antialias: true }, "antialias")
  .name("Antialiasing")
  .onChange((val) => {
    renderer.setPixelRatio(val ? window.devicePixelRatio : 1);
  });

perfFolder
  .add({ fps: 60 }, "fps", [30, 60, 120])
  .name("Target FPS")
  .onChange((val) => {
    console.log(`Target FPS set to: ${val}`);
  });

// ==========================================
// 13. INITIALIZATION & ANIMATION LOOP
// ==========================================

loadCar();

// Auto-start
setTimeout(() => {
  loadMap("Test Mode (Debug)");
  console.log("✅ Sistem siap. Gunakan WASD.");
}, 100);
let lastTime = 0;
const targetFPS = 60;
const frameInterval = 1000 / targetFPS;
function animate(currentTime) {
  requestAnimationFrame(animate);

  const deltaTime = currentTime - lastTime;
  if (deltaTime < frameInterval) return;
  lastTime = currentTime - (deltaTime % frameInterval);
  const deltaSeconds = deltaTime / 1000;

  // 1. Update Posisi Mobil (Physics)
  updateCar();

  // 2. Update Director System (Cinematics)
  if (Director.active) {
    Director.update(deltaSeconds);
  }
  // 3. Normal Controls Update
  else if (!carSettings.followCamera) {
    controls.update();
  }
  
  AutoShowcase.update(deltaSeconds);

  // ==========================================
  // 🔥 UPDATE POSISI MATAHARI SETIAP FRAME 🔥
  // ==========================================
  // Ini wajib ada agar logika "Auto Follow" dan "Manual GUI" berjalan mulus
  if (typeof updateSunPosition === "function") {
      updateSunPosition();
  }

  // Update Lighting Animation (Hemisphere breathing effect)
  if (lightingConfig.environmentRotation !== 0) {
    const time = clock.getElapsedTime();
    hemisphereLight.position.x = Math.sin(time * 0.1) * 100;
    hemisphereLight.position.z = Math.cos(time * 0.1) * 100;
  }

  renderer.render(scene, camera);
}

// Event Resize (Biarkan tetap ada)
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start Loop
animate(0);

// ==========================================
// 14. TRANSITION EFFECT (FADE CURTAIN)
// ==========================================

const fadeCurtain = document.createElement("div");
fadeCurtain.id = "global-fade-curtain"; // 🔥 TAMBAHKAN ID INI
fadeCurtain.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: #000; opacity: 0; pointer-events: none;
    transition: opacity 0.5s ease-in-out; z-index: 10000;
`;
document.body.appendChild(fadeCurtain);

function triggerTransition(callback) {
  // 1. Layar Gelap
  fadeCurtain.style.opacity = "1";

  // 2. Tunggu sebentar (600ms) agar layar gelap sempurna, lalu load map
  setTimeout(() => {
    if (callback) callback();

    // ❌ KITA HAPUS BAGIAN INI (Auto Fade Out)
    // setTimeout(() => { fadeCurtain.style.opacity = "0"; }, 800);

    // Biarkan layar tetap GELAP sampai coreLoadMap memanggil finishLoading()
  }, 600);
}
// ==========================================
// 15. AUTO SHOWCASE SYSTEM
// ==========================================

const AutoShowcase = {
  active: false,
  timer: 0,
  durationPerMap: 12, // Detik per map
  currentIndex: 0,
  // Ambil semua nama map dari sceneRegistry, kecuali Test Mode
  playlist: Object.keys(sceneRegistry).filter((name) => name !== "Test Mode (Debug)"),

  start: function () {
    if (this.active) return;
    this.active = true;
    this.timer = 0;
    this.currentIndex = 0;
    console.log("📺 Auto Showcase Started!");

    // Mulai dari map pertama
    this.loadCurrentMap();
  },

  stop: function () {
    this.active = false;
    console.log("📺 Auto Showcase Stopped.");
  },

  next: function () {
    this.currentIndex++;
    // Jika sudah habis, ulang dari awal (Looping)
    if (this.currentIndex >= this.playlist.length) {
      this.currentIndex = 0;
    }
    this.loadCurrentMap();
  },

  loadCurrentMap: function () {
    const mapName = this.playlist[this.currentIndex];

    // Gunakan efek transisi agar rekaman mulus
    triggerTransition(() => {
      console.log(`📺 Showcase Switching to: ${mapName}`);

      // Update dropdown GUI agar sinkron
      mapControls.selectedMap = mapName;

      // Load Map
      loadMap(mapName);

      // Pastikan mobil jalan otomatis & kamera sinematik nyala
      // (Tergantung logika di dalam function map masing-masing)
      if (carSettings) {
        carSettings.autoDrive = true;
        // Opsional: Reset speed agar tidak terlalu ngebut dari map sebelumnya
        carSpeed = 0;
      }
    });
  },

  update: function (delta) {
    if (!this.active) return;

    this.timer += delta;

    // Cek apakah waktunya ganti map
    if (this.timer > this.durationPerMap) {
      this.timer = 0;
      this.next();
    }
  },
};

// Helper HTML Loading
const loadingDiv = document.createElement("div");
loadingDiv.id = "loading";
loadingDiv.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: #transparent; color: #fff; display: flex; flex-direction: column;
    align-items: center; justify-content: center; z-index: 9999;
`;
loadingDiv.innerHTML = "<span>Memuat Engine...</span>";
document.body.appendChild(loadingDiv);

setTimeout(() => {
  if (loadingDiv) loadingDiv.style.display = "none";
}, 3000);
