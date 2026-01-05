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
dirLight.shadow.camera.far = 500;
dirLight.shadow.camera.left = -100;
dirLight.shadow.camera.right = 100;
dirLight.shadow.camera.top = 100;
dirLight.shadow.camera.bottom = -100;
scene.add(dirLight);

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
  // --- FITUR BARU: Toggle GUI dengan tombol 'V' ---
  if (key === "v") {
    const guiContainer = gui.domElement;
    // Cek apakah sedang hidden atau tidak
    if (guiContainer.style.display === "none") {
      guiContainer.style.display = "block"; // Munculkan
    } else {
      guiContainer.style.display = "none"; // Sembunyikan
    }
  }
});


window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

// ==========================================
// 5. HELPER FUNCTIONS
// ==========================================
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
    carModel.userData.lightSources = [];
    carModel.userData.headlightMeshes = [];
    carModel.userData.taillightMeshes = [];

    // 1. CARI MESH
    carModel.traverse((child) => {
      if (child.isMesh) {
        const name = child.name;

        // Deteksi Lampu Depan
        if (name === "Lampu_Depan" || 
            name.includes("HEADLIGHT_LENS") || 
            name.includes("FRONTBUMPER_mm_lights") ||
            name.includes("CHASSIS_mm_lights")) {
          
          child.material = child.material.clone(); // Clone biar aman
          child.material.emissive = new THREE.Color(0xffffff);
          child.material.emissiveIntensity = 0;
          child.material.side = THREE.DoubleSide; // Fix Lampu Kanan
          
          carModel.userData.headlightMeshes.push(child);
        }

        // Deteksi Lampu Belakang
        if (name.includes("TAILLIGHT") || 
            name.includes("REARBUMPER_mm_lights") || 
            name.includes("BOOT_mm_lights") || 
            name.includes("BRAKES") ||
            name === "Lampu_Belakang") {
           
           child.material = child.material.clone();
           child.material.emissive = new THREE.Color(0xff0000);
           child.material.emissiveIntensity = 0;
           child.material.side = THREE.DoubleSide;

           carModel.userData.taillightMeshes.push(child);
        }
      }
    });

    // 2. SETUP SUMBER CAHAYA
    const addSpotLight = (x, y, z) => {
      const light = new THREE.SpotLight(0xffffff, 0, 100, 0.6, 0.5, 1);
      light.position.set(x, y, z);
      light.target.position.set(x, 0.5, z + 20); 
      carModel.add(light);
      carModel.add(light.target);
      carModel.userData.lightSources.push({ light: light, type: "head" });
    };

    const addPointLight = (x, y, z) => {
      const light = new THREE.PointLight(0xff0000, 0, 5, 2);
      light.position.set(x, y, z);
      carModel.add(light);
      carModel.userData.lightSources.push({ light: light, type: "tail" });
    };

    addSpotLight(0.8, 0.8, 2.2); 
    addSpotLight(-0.8, 0.8, 2.2);
    addPointLight(0.7, 0.9, -2.4); 
    addPointLight(-0.7, 0.9, -2.4);

    carModel.userData.lightsInitialized = true;
  }

  // --- B. LOGIKA ON/OFF DEFAULT (Semua Nyala jika true) ---
  const headIntensity = turnOn ? 50 : 0;
  const tailIntensity = turnOn ? 5 : 0;
  const spotIntensity = turnOn ? 50 : 0;
  const pointIntensity = turnOn ? 5 : 0;

  // Update Mesh Depan
  if (carModel.userData.headlightMeshes) {
      carModel.userData.headlightMeshes.forEach(mesh => mesh.material.emissiveIntensity = headIntensity);
  }
  // Update Mesh Belakang
  if (carModel.userData.taillightMeshes) {
      carModel.userData.taillightMeshes.forEach(mesh => mesh.material.emissiveIntensity = tailIntensity);
  }
  // Update Cahaya
  if (carModel.userData.lightSources) {
      carModel.userData.lightSources.forEach(item => {
          item.light.intensity = (item.type === 'head') ? spotIntensity : pointIntensity;
      });
  }
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
    dirLight.position.set(carPos.x + lightingConfig.dirPositionX, carPos.y + lightingConfig.dirPositionY, carPos.z + lightingConfig.dirPositionZ);

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
      fadeIn();
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

function scene_TestMode() {
  coreLoadMap("test", () => {
    setSpawn(0, 0, 0, 0);
    lightingThemes.daylight();
    // Tidak ada cinematic, langsung main
  });
}

function scene_City() {
  console.log("🎬 Map: City (Final Precise Setup)");

  if (typeof AutoShowcase !== "undefined") AutoShowcase.active = false;

  fadeOut(() => {
    coreLoadMap("city_for_my_game.glb", () => {
      // --- SETUP ---
      scaleParams.autoScale = true;
      if (carModel) carModel.scale.set(1, 1, 1);
      if (scaleParams) scaleParams.size = 1;
      setSpawn(119.1, -9.35, -197.2, Math.PI / 10);
      lightingThemes.sunset();
      toggleCarLights(false);
      lightingConfig.shadowEnabled = true;
      lightingConfig.shadowRange = 300;
      lightingConfig.targetX = 119;
      lightingConfig.targetZ = -197;
      lightingConfig.dirPositionY = 50;
      lightingConfig.dirPositionX = 100;
      updateLighting();

      // D. Setup Director & Mobil
      carSettings.autoDrive = false;
      carSettings.maxSpeed = 1.0;
      carSettings.acceleration = 0.015;
      carSettings.turnSpeed = 0.03;
      carSpeed = 0;
      let safeSpot = null;
      let isTransitioning = false; // Flag agar tidak double load

      // E. Jalankan Director
      Director.loadScenario((delta, t) => {
        // === TRANSISI KE SCENE 2 ===
        // Mobil mulai melambat di detik 16, jadi kita cut di detik 15.5
        if (t > 15.5 && !isTransitioning) {
            isTransitioning = true;
            console.log("🎬 Cut! Moving to Bridge...");
            fadeOut(() => {
                loadMap("2. bridge_design"); // Pindah ke Scene 2
            });
            return;
        }
        
        // Loop standard dimatikan karena kita pindah scene
        if (isTransitioning) return;

        // Mobil Logic
        if (t > 3.0 && t < 16.0) {
          if (!carSettings.autoDrive) {
            carSettings.autoDrive = true;
            toggleCarLights(true);
          }
        } else if (t >= 16.0) {
          carSettings.autoDrive = false;
          carSpeed *= 0.9;
        }

        // Steering Logic
        if (t > 3.5 && t < 4.0) {
          const p = THREE.MathUtils.smoothstep(t, 3.5, 4.0);
          carModel.rotation.y -= 0.023 * p;
          steeringAngle = -0.5 * p;
        } else if (t >= 4.0) {
          steeringAngle += (0 - steeringAngle) * 0.1;
        }

        // Camera Logic
        if (t < 3.0) {
          const a = t * 0.2;
          camera.position.set(carModel.position.x + Math.sin(a) * 5.5, carModel.position.y + 1.5, carModel.position.z + Math.cos(a) * 5.5);
          controls.target.copy(carModel.position);
        } else if (t >= 3.0 && t < 8.0) {
          const rel = new THREE.Vector3(2.5, 0.5, 1.5).applyMatrix4(carModel.matrixWorld);
          rel.y += Math.random() * 0.01;
          camera.position.lerp(rel, 0.1);
          const la = carModel.position.clone().add(new THREE.Vector3(0, 0, 5).applyQuaternion(carModel.quaternion));
          controls.target.lerp(la, 0.1);
        } else if (t >= 8.0 && t < 12.0) {
          const p = THREE.MathUtils.smoothstep((t - 8.0) / 4.0, 0, 1);
          const r = THREE.MathUtils.lerp(3.0, 8.5, p);
          const a = THREE.MathUtils.lerp(Math.PI / 2, 0.05, p);
          const rel = new THREE.Vector3(Math.sin(a) * r, THREE.MathUtils.lerp(0.5, 0.6, p), Math.cos(a) * r).applyMatrix4(carModel.matrixWorld);
          camera.position.lerp(rel, 0.1);
          controls.target.lerp(carModel.position, 0.3);
        } else {
          if (!safeSpot) {
            safeSpot = camera.position.clone();
            const rv = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize().multiplyScalar(7);
            safeSpot.add(rv);
            safeSpot.y = 2.0;
          }
          camera.position.lerp(safeSpot, 0.08);
          if (carModel) controls.target.lerp(carModel.position, 0.1);
        }
      });
      fadeIn();
    });
  });
}
// =========================================
// Map 2
// =========================================
function scene_BridgeDesign() {
  console.log("🎬 Map 2: Bridge ");

  if (typeof AutoShowcase !== "undefined") AutoShowcase.active = false;
  fadeOut(() => {
    coreLoadMap("bridge_design.glb", () => {
      setSpawn(-190.02, 6.0, 6.39, 2.02);
      scaleParams.autoScale = true;
      if (carModel) carModel.scale.set(1, 1, 1);
      if (scaleParams) scaleParams.size = 1;
      lightingThemes.daylight();
      lightingConfig.shadowRange = 50;
      lightingConfig.targetX = -190;
      lightingConfig.targetZ = 0;
      lightingConfig.shadowBias = 0;
      lightingConfig.dirPositionX = 50;
      lightingConfig.dirPositionY = 150;
      lightingConfig.dirPositionZ = 50;
      lightingConfig.ambientIntensity = 0.4;
      lightingConfig.dirIntensity = 2.5;
      updateLighting();


      // NAVIGASI
      const POINT_START_TURN = new THREE.Vector3(-25.26, 10.85, -73.21);
      const POINT_END_TURN = new THREE.Vector3(185.24, 13.55, -90.06);
      const POINT_STOP = new THREE.Vector3(526.59, 5.9, -6.97);

      carSettings.autoDrive = false;
      carSettings.maxSpeed = 1.4;
      carSettings.acceleration = 0.02;
      carSettings.turnSpeed = 0.05;
      carSpeed = 0;
      toggleCarLights(true);

      if (carModel.userData.headlightMeshes) {
          carModel.userData.headlightMeshes.forEach(mesh => mesh.material.emissiveIntensity = 0);
      }

    // C. Matikan SUMBER CAHAYA (Yang menyorot ke aspal)
    if (carModel.userData.lightSources) {
        carModel.userData.lightSources.forEach(item => {
            // Matikan Lampu Depan
            if (item.type === 'head') {
                item.light.intensity = 0;
            }
            // Matikan Lampu Belakang (Sorotan Merah di aspal)
            if (item.type === 'tail') {
                item.light.intensity = 0; 
            }
        });
      }
      const SKY_LINK_POS = new THREE.Vector3(0, 40, -10);

      if (carModel) {
        const startPos = new THREE.Vector3(2.0, 1.2, -4.5).applyMatrix4(carModel.matrixWorld);
        camera.position.copy(startPos);
        camera.lookAt(carModel.position);
      }

      let isTurning = false;
      let hasFinishedTurn = false;
      let hasReachedFinish = false;
      let isTransitioning = false; // Flag Transisi
      let finishTimer = 0; // Timer setelah finish

      Director.loadScenario((delta, t) => {
        // === TRANSISI KE SCENE 3 ===
      if (t > 18.5 && !isTransitioning) {
            isTransitioning = true;
            console.log("🎬 Cut! Moving to Highway (While Driving)...");
            fadeOut(() => {
                loadMap("3. Highway");
            });
        }
        // Jika sedang transisi, hentikan logic lain
        if(isTransitioning) return;


        // Logic Navigasi (Sama seperti sebelumnya)
        const distStart = carModel.position.distanceTo(POINT_START_TURN);
        const distEnd = carModel.position.distanceTo(POINT_END_TURN);
        const distStop = carModel.position.distanceTo(POINT_STOP);

        if (!isTurning && !hasFinishedTurn && distStart < 15.0) {
          isTurning = true;
        }
        if (isTurning && distEnd < 15.0) {
          isTurning = false;
          hasFinishedTurn = true;
        }
        if (!hasReachedFinish && distStop < 10.0) {
          hasReachedFinish = true;
        }

        if (t < 1.5) {
          carSpeed = 0;
            carSpeed = 0;
            if (carWheels.length > 0) {
             // Putar ban secara visual manual (X axis)
             // Kecepatan putar visual semakin kencang seiring mendekati t=1.5
             const spinIntensity = t * 15.0; 
             carWheels.forEach(w => w.rotation.x += spinIntensity * delta);
          }
        } else {
          if (hasReachedFinish) {
            carSettings.autoDrive = false;
            carSpeed *= 0.8;
            if (carSpeed < 0.01) carSpeed = 0;
          } else {
            if (!carSettings.autoDrive) carSettings.autoDrive = true;
            if (isTurning) {
              carModel.rotation.y -= 0.0022;
              steeringAngle = 0.12;
            } else {
              steeringAngle = 0;
            }
          }
        }

        // Camera Logic (Sama)
        let relOffset, lookTarget, cameraStiffness = 0.3;
        const ANCHOR_START_ORBIT = new THREE.Vector3(-2.0, 0.8, -1.8);

        if (t < 3.5) {
          const p = t / 3.5;
          const smoothP = THREE.MathUtils.smoothstep(p, 0, 1);
          const startPos = new THREE.Vector3(-1.3, 0.4, -1.1);
          const endPos = ANCHOR_START_ORBIT;
          relOffset = new THREE.Vector3().lerpVectors(startPos, endPos, smoothP);
          const startLook = new THREE.Vector3(-0.9, 0.4, -1.5);
          const endLook = new THREE.Vector3(0, 0.6, 0);
          lookTarget = carModel.position.clone().add(new THREE.Vector3().lerpVectors(startLook, endLook, smoothP));
          cameraStiffness = 0.2;
        } else if (t >= 3.5 && t < 11.5) {
          const duration = 10.0;
          const progress = (t - 3.5) / duration;
          const smoothP = THREE.MathUtils.smoothstep(progress, 0, 1);
          const startAngle = -2.6;
          const endAngle = 1.5;
          const currentAngle = THREE.MathUtils.lerp(startAngle, endAngle, smoothP);
          const radiusArc = Math.sin(smoothP * Math.PI);
          const radius = 3.0 + radiusArc * 3.0;
          const x = Math.sin(currentAngle) * radius;
          const zBase = Math.cos(currentAngle) * radius;
          const forwardBoost = smoothP * 6.0;
          const z = zBase + forwardBoost;
          relOffset = new THREE.Vector3(x, 1.0, z);
          lookTarget = carModel.position.clone().add(new THREE.Vector3(0, 0.7, 0.0));
          cameraStiffness = 0.2;
        } else {
          const duration = 6.0;
          const progress = Math.min((t - 11.5) / duration, 1.0);
          const smoothP = THREE.MathUtils.smoothstep(progress, 0, 1);
          const startPos = new THREE.Vector3(2.97, 1.0, 6.21);
          const startLook = new THREE.Vector3(0, 0.7, 0.0);
          const endPos = new THREE.Vector3(1.5, 0.4, -6.0);
          const endLook = new THREE.Vector3(0, 0.5, -2.0);
          relOffset = new THREE.Vector3().lerpVectors(startPos, endPos, smoothP);
          lookTarget = carModel.position.clone().add(new THREE.Vector3().lerpVectors(startLook, endLook, smoothP));
          cameraStiffness = 0.05;
        }

        const worldCam = relOffset.applyMatrix4(carModel.matrixWorld);
        camera.position.lerp(worldCam, cameraStiffness);
        controls.target.lerp(lookTarget, cameraStiffness);
      });
      Director.play();
    });
  });
}
// =========================================
// Map 3
// =========================================
function scene_Highway() {
  console.log("🎬 Map 3: Highway (Night Mode + Fixed Shadow)");

  if (typeof AutoShowcase !== "undefined") AutoShowcase.active = false;

  fadeOut(() => {
    coreLoadMap("road__highway.glb", () => {
      fadeIn();

      const streetLightColor = 0xffaa00; 
      
      // Update matrix dunia dulu biar posisi akurat
      currentMapModel.updateMatrixWorld(true);

      currentMapModel.traverse((child) => {
        if (child.isMesh) {
            
            // 1. Hitung Kotak Pembatas (Bounding Box) fisik objek
            if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
            
            // 2. Konversi posisi kotak itu ke World Space (Posisi Dunia)
            const box = child.geometry.boundingBox.clone();
            box.applyMatrix4(child.matrixWorld);
            
            // 3. Ambil titik tengah (Center) dan ukurannya (Size)
            const center = new THREE.Vector3();
            const size = new THREE.Vector3();
            box.getCenter(center);
            box.getSize(size);

            // 💡 LOGIKA DETEKSI BARU:
            // - Tinggi (Y) titik tengah harus di atas 5 meter (Lampu jalan biasanya 6-10m)
            // - Tinggi (Y) tidak boleh lebih dari 20 meter (Bukan awan/burung)
            // - Ukuran objek tidak boleh raksasa (Size < 10m), biar tidak menempelkan lampu ke gedung/tanah
            
            const isFloatingHigh = center.y > 5.0 && center.y < 20.0;
            const isSmallObject = size.x < 10 && size.z < 10; // Bukan tanah luas

            if (isFloatingHigh && isSmallObject) {
                
                // console.log("💡 Light detected at Y:", center.y.toFixed(2));

                // A. EFEK NEON (GLOW)
                child.material = child.material.clone();
                child.material.emissive = new THREE.Color(streetLightColor);
                child.material.emissiveIntensity = 10.0;
                child.material.toneMapped = false;      

                // B. SUMBER CAHAYA (SPOTLIGHT)
                const spot = new THREE.SpotLight(streetLightColor, 100, 60, 1.0, 0.5, 1.0);
                
                // Posisikan cahaya tepat di titik tengah objek (Center Bounding Box)
                // Kita perlu convert balik ke local space child karena kita akan add ke child
                const localPos = child.worldToLocal(center.clone());
                spot.position.copy(localPos);
                
                // Arahkan ke bawah
                const target = new THREE.Object3D();
                target.position.set(localPos.x, localPos.y - 20, localPos.z);
                child.add(target);
                spot.target = target;
                spot.castShadow = false; // Matikan shadow lampu jalan demi performa

                child.add(spot);

                // C. DEBUG VISUAL (BOLA MERAH)
                // Ini untuk menandai objek mana yang dianggap lampu.
                // Kalau berhasil, kamu akan lihat bola merah di tiang lampu.
                /*
                const debugGeom = new THREE.SphereGeometry(0.5, 8, 8);
                const debugMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                const debugMesh = new THREE.Mesh(debugGeom, debugMat);
                debugMesh.position.copy(localPos);
                child.add(debugMesh);
                */
            }
        }
      });

      const TRACK_PATH = [
        { x: 16.18, z: -56.94, turnVal: 0.2, rotSpeed: -0.015, duration: 0.8, name: "Tikungan 1" },
        { x: 2.78, z: -5.72, turnVal: -0.2, rotSpeed: 0.015, duration: 0.4, name: "Tikungan 2" },
        { x: -22.46, z: 40.15, turnVal: 0.2, rotSpeed: -0.015, duration: 0.7, name: "Tikungan 3" },
      ];

      const INITIAL_ROT = 5.4;
      setSpawn(20.39, 0.2, -60.41, INITIAL_ROT);

      scaleParams.autoScale = true;
      if (carModel) carModel.scale.set(1, 1, 1);
      if (scaleParams) scaleParams.size = 1;

      lightingThemes.night();
      lightingConfig.targetX = 20;
      lightingConfig.targetZ = -60;
      lightingConfig.dirPositionX = -50;
      lightingConfig.dirPositionY = 100;
      lightingConfig.dirPositionZ = 50;
      lightingConfig.dirColor = "#aaccff";
      lightingConfig.dirIntensity = 0.8;
      lightingConfig.shadowRange = 150;
      lightingConfig.shadowBias = -0.0001;
      lightingConfig.ambientIntensity = 0.3;
      lightingConfig.ambientColor = "#111122";
      updateLighting();
      toggleCarLights(true);
// Kita buat kacanya sendiri menyala TERANG MERAH (Neon Look)
    if (carModel.userData.taillightMeshes) {
        carModel.userData.taillightMeshes.forEach(mesh => {
            // Wajib false agar merahnya tidak jadi putih/kuning saat terang
            if(mesh.material.toneMapped !== false) mesh.material.toneMapped = false;
            
            // Naikkan intensity kaca biar terlihat "pedas" di mata
            mesh.material.emissiveIntensity = 5.0; 
        });
    }

    // --- 2. CAHAYA DI JALAN (LIGHT SOURCE) ---
    if (carModel.userData.lightSources) {
        carModel.userData.lightSources.forEach(item => {
            
            if (item.type === 'tail') {
                // Trik Realistis: Intensity Sedang, tapi Jarak Jauh & Pudar Pelan
                
                item.light.intensity = 0.8;  // Cukup terang, tidak berlebihan
                
                item.light.distance = 15.0;  // JANGKAUAN LUAS (Biar "banjir" merahnya jauh ke belakang)
                
                item.light.decay = 1.5;      // RAHASIA: Turunkan dari 2.0 ke 1.5
                                             // Decay rendah = cahaya merambat lebih jauh sebelum hilang
                                             // Ini bikin efek "kabut merah" di aspal tanpa bikin silau.

                // Opsional: Geser posisi lampu sedikit ke belakang & atas
                // Biar tidak menempel di aspal (menghindari titik putih di tanah)
                // item.light.position.y += 0.1; 
                // item.light.position.z -= 0.5;
            }
        });
      }
      camera.near = 0.05;
      camera.updateProjectionMatrix();

      carSettings.autoDrive = false;
      carSettings.maxSpeed = 0.8;
      carSettings.acceleration = 0.02;
      carSettings.turnSpeed = 0.05;
      carSpeed = 0;

      let currentTargetIndex = 0;
      let currentRotSpeed = 0;
      const FIXED_STEP = 1 / 60;
      let accumulator = 0;
      let physicsRotY = INITIAL_ROT;
      let turnTimer = 0;
      let isTransitioning = false; // Flag Transisi

      Director.loadScenario((delta, t) => {
        // === TRANSISI KE SCENE 4 ===
        // Stop time adalah t=8.0, kita cut di 7.5
        if (t > 7.5 && !isTransitioning) {
            isTransitioning = true;
            console.log("🎬 Cut! Moving to Mountain...");
            fadeOut(() => {
                loadMap("4. Mountain Road");
            });
            return;
        }

        if(isTransitioning) return;

        // A. FISIKA STABIL (Sama)
        accumulator += Math.min(delta, 0.1);
        while (accumulator >= FIXED_STEP) {
          if (t < 1.0) {
            carSpeed = 0;
          }
          // Fase STOP
          else if (t >= 8.0) {
            carSettings.autoDrive = false;
            carSpeed = 0;
            currentRotSpeed = 0;
            steeringAngle = 0;
          }
          // Fase Jalan
          else {
            if (!carSettings.autoDrive) carSettings.autoDrive = true;
            if (turnTimer > 0) {
              turnTimer -= FIXED_STEP;
              if (turnTimer <= 0) {
                steeringAngle = 0;
                currentRotSpeed = 0;
                turnTimer = 0;
              }
            }
            if (currentTargetIndex < TRACK_PATH.length) {
              const target = TRACK_PATH[currentTargetIndex];
              const carPos = new THREE.Vector2(carModel.position.x, carModel.position.z);
              const targetPos = new THREE.Vector2(target.x, target.z);
              if (carPos.distanceTo(targetPos) < 2.0) {
                steeringAngle = target.turnVal;
                currentRotSpeed = target.rotSpeed;
                turnTimer = target.duration;
                currentTargetIndex++;
              }
            }
            if (currentRotSpeed !== 0) physicsRotY -= currentRotSpeed;
          }
          accumulator -= FIXED_STEP;
        }

        if (carModel) {
          const smoothFactor = Math.min(delta * 15.0, 1.0);
          carModel.rotation.y = THREE.MathUtils.lerp(carModel.rotation.y, physicsRotY, smoothFactor);
        }

        // Camera Logic (Sama)
        let camOffset, lookTargetOffset;
        if (t < 3.0) {
          const p = t / 3.0;
          const smoothP = THREE.MathUtils.smoothstep(p, 0, 1);
          const startPos = new THREE.Vector3(0.0, 2.0, -5.0);
          const endPos = new THREE.Vector3(0.0, 6.0, -12.0);
          camOffset = new THREE.Vector3().lerpVectors(startPos, endPos, smoothP);
          lookTargetOffset = new THREE.Vector3(0, 0.5, 5.0);
        } else if (t >= 3.0 && t < 6.0) {
          camOffset = new THREE.Vector3(12.0, 12.0, -2.0);
          lookTargetOffset = new THREE.Vector3(0, 0.0, 4.0);
        } else {
          const zoomStartTime = 6.0;
          const zoomDuration = 4.0;
          const progress = Math.min(Math.max((t - zoomStartTime) / zoomDuration, 0), 1);
          const smoothP = THREE.MathUtils.smoothstep(progress, 0, 1);
          const startPos = new THREE.Vector3(0.0, 15.0, -10.0);
          const endPos = new THREE.Vector3(5.0, 2.0, -5.0);
          const startLook = new THREE.Vector3(0, 0.0, 10.0);
          const endLook = new THREE.Vector3(0, 0.5, 0.0);
          camOffset = new THREE.Vector3().lerpVectors(startPos, endPos, smoothP);
          lookTargetOffset = new THREE.Vector3().lerpVectors(startLook, endLook, smoothP);
        }

        const finalCamPos = camOffset.clone().applyQuaternion(carModel.quaternion);
        const finalTargetPos = lookTargetOffset.clone().applyQuaternion(carModel.quaternion);
        const worldCam = carModel.position.clone().add(finalCamPos);
        const worldTarget = carModel.position.clone().add(finalTargetPos);

        camera.position.lerp(worldCam, 0.08);
        controls.target.lerp(worldTarget, 0.08);
      });

      Director.play();
    });
  });
}

// =========================================
// Map 4
// =========================================
function scene_MountainRoad() {
  console.log("🎬 Map 4: Mountain Road (Optimized Performance)");

  if (typeof AutoShowcase !== "undefined") AutoShowcase.active = false;

  // --- TEKNIK 1: TURUNKAN RESOLUSI RENDER (GPU SAVER) ---
  // Layar HP/Retina punya pixel ratio 3-4x, ini sangat berat.
  // Kita kunci maksimal di 1.5x atau 2.0x agar tetap tajam tapi ringan.
  const originalPixelRatio = renderer.getPixelRatio();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); 

  fadeOut(() => {
    coreLoadMap("mountain_road_scene.glb", () => {
      
      // --- TEKNIK 2: STATIC OBJECT FREEZE (CPU SAVER) ---
      // Karena map gunung TIDAK BERGERAK, kita matikan cek posisinya tiap frame.
      if (currentMapModel) {
        currentMapModel.traverse((child) => {
          if (child.isMesh) {
            child.matrixAutoUpdate = false; // Stop hitung posisi tiap frame
            child.updateMatrix(); // Hitung sekali saja di awal
            
            // Opsional: Matikan castShadow untuk objek kecil di map (batu kecil dll)
            // if (child.name.includes("grass") || child.name.includes("rock_small")) {
            //    child.castShadow = false;
            // }
          }
        });
      }

      // 1. TRACK PATH
      const TRACK_PATH = [
        { x: -1.0, z: -2.28, turnVal: -0.4, rotSpeed: 0.0405, duration: 0.45, name: "Tikungan 1" },
        { x: -0.96, z: -1.85, turnVal: 0.4, rotSpeed: 0.0335, duration: 0.345, name: "Tikungan 2" },
        { x: -1.04, z: -1.47, turnVal: 0.4, rotSpeed: -0.028, duration: 0.25, name: "Tikungan 3" },
        { x: -1.02, z: -1.13, turnVal: -0.4, rotSpeed: -0.045, duration: 0.45, name: "Tikungan 4" },
        { x: -0.75, z: -0.8, turnVal: -0.4, rotSpeed: 0.035, duration: 0.35, name: "Tikungan 5" },
        { x: -0.59, z: -0.46, turnVal: 0.4, rotSpeed: 0.0335, duration: 0.35, name: "Tikungan 6" },
      ];

      setSpawn(-1.14, 10, -2.53, 6.83);
      scaleParams.autoScale = false;
      const MICRO_SCALE = 0.01;
      if (carModel) carModel.scale.set(MICRO_SCALE, MICRO_SCALE, MICRO_SCALE);
      if (scaleParams) scaleParams.size = MICRO_SCALE;
      
      // Lighting Setup
      lightingThemes.daylight();
      lightingConfig.targetX = -1.14;
      lightingConfig.targetZ = -2.53;
      
      // Shadow Optimization: Karena mobil kecil, shadow range kecil saja cukup
      lightingConfig.shadowRange = 5; 
      // Matikan shadow map yang terlalu besar jika tidak perlu
      if(dirLight && dirLight.shadow.mapSize.width > 2048) {
         dirLight.shadow.mapSize.width = 2048;
         dirLight.shadow.mapSize.height = 2048;
      }

      updateLighting();
      toggleCarLights(true);

      if (carModel.userData.headlightMeshes) {
          carModel.userData.headlightMeshes.forEach(mesh => mesh.material.emissiveIntensity = 0);
      }

      // Light Fix (Micro Scale)
      if (carModel && carModel.userData.lightSources) {
        carModel.userData.lightSources.forEach((item) => {
          if (item.type === "head") {
            item.light.intensity = 0;
            item.light.distance = 0;
          } else if (item.type === "tail") {
            item.light.intensity = 0;
          }
          // Optimize shadow bias untuk skala mikro
          if (item.light.shadow) {
            item.light.shadow.bias = -0.00005; // Bias lebih kecil
            item.light.shadow.mapSize.width = 512; // Kecilkan resolusi shadow lampu mobil
            item.light.shadow.mapSize.height = 512;
          }
        });
        carModel.updateMatrixWorld(true);
      }

      camera.near = 0.001;
      camera.updateProjectionMatrix();

      carSettings.autoDrive = false;
      carSettings.maxSpeed = 0.8;
      carSettings.acceleration = 0.01;
      carSettings.turnSpeed = 0.05;
      carSpeed = 0;

      let currentTargetIndex = 0;
      let currentRotSpeed = 0;
      let stopTurnTime = 0;
      let isTransitioning = false; 

      Director.loadScenario((delta, t) => {
        // === TRANSISI KE SCENE 5 ===
        if (t > 24.0 && !isTransitioning) {
            isTransitioning = true;
            
            // Restore Pixel Ratio Asli sebelum pindah map (Opsional, atau biarkan ringan)
            // renderer.setPixelRatio(originalPixelRatio);

            console.log("🎬 Cut! Moving to American Underpass...");
            fadeOut(() => {
                loadMap("5. American Underpass:"); 
            });
            return;
        }
        if(isTransitioning) return;

        // Logic Mobil
        if (t < 4.0) {
          carSpeed = 0;
        } else {
          if (!carSettings.autoDrive) carSettings.autoDrive = true;
          if (stopTurnTime > 0 && t > stopTurnTime) {
            steeringAngle = 0;
            currentRotSpeed = 0;
            stopTurnTime = 0;
          }
          if (currentTargetIndex < TRACK_PATH.length) {
            const target = TRACK_PATH[currentTargetIndex];
            const carPos = new THREE.Vector2(carModel.position.x, carModel.position.z);
            const targetPos = new THREE.Vector2(target.x, target.z);
            if (carPos.distanceTo(targetPos) < 0.05) {
              steeringAngle = target.turnVal;
              currentRotSpeed = target.rotSpeed;
              stopTurnTime = t + (target.duration || 0);
              currentTargetIndex++;
            }
          }
          if (currentRotSpeed !== 0) {
            carModel.rotation.y -= currentRotSpeed * (delta / 0.0166) * 0.33;
          }
        }

        // Logic Kamera
        if (carModel) {
          if (t < 4.0) {
            const angle = t * 0.5;
            const radius = 0.15;
            camera.position.set(carModel.position.x + Math.cos(angle) * radius, carModel.position.y + 0.03 + t * 0.005, carModel.position.z + Math.sin(angle) * radius);
            controls.target.copy(carModel.position);
          } else if (t >= 4.0 && t < 25.0) {
            let targetOffset, lookTarget, smoothSpeed = 0.1;
            if (t <= 12.0 || t >= 19.0) {
              targetOffset = new THREE.Vector3(0.0, 0.03, -0.08);
              lookTarget = new THREE.Vector3(0, 0, 0.5);
            } else {
              targetOffset = new THREE.Vector3(0.1, 0.02, 0.15);
              lookTarget = new THREE.Vector3(0, 0, 0.0);
              smoothSpeed = 0.2;
            }
            const destPos = carModel.position.clone().add(targetOffset.clone().applyQuaternion(carModel.quaternion));
            camera.position.lerp(destPos, smoothSpeed);
            const lookOffset = lookTarget.clone();
            if (currentRotSpeed !== 0 && (t <= 12.0 || t >= 19.0)) lookOffset.x = steeringAngle * 0.4;
            controls.target.lerp(carModel.position.clone().add(lookOffset.applyQuaternion(carModel.quaternion)), smoothSpeed);
          } else {
            const endPos = carModel.position.clone().add(new THREE.Vector3(0, 0.15, -0.2).applyQuaternion(carModel.quaternion));
            camera.position.lerp(endPos, 0.05);
            controls.target.copy(carModel.position);
          }
        }
      });

      Director.play();
    });
  });
}
// =========================================
// Map 5
// =========================================
function scene_AmericanUnderpass() {
  console.log("🎬 Map 5: American Underpass (Final Fix)");

  fadeOut(() => {
    coreLoadMap("american_road_underpass_bridge.glb", () => {
      // ... SETUP AWAL (Scale 30, Lighting, dll sama seperti kode asli) ...
      const spawnX = -1124;
      const spawnY = -15;
      const spawnZ = -94;
      setSpawn(spawnX, spawnY, spawnZ, Math.PI / 2);
      lightingThemes.daylight();
      scaleParams.autoScale = false;
      const BIG_SCALE = 30;
      if (carModel) carModel.scale.set(BIG_SCALE, BIG_SCALE, BIG_SCALE);
      if (scaleParams) scaleParams.size = BIG_SCALE;
      lightingConfig.shadowAutoUpdate = false;
      lightingConfig.targetX = spawnX;
      lightingConfig.targetZ = spawnZ;
      lightingConfig.dirPositionX = 100;
      lightingConfig.dirPositionY = 500;
      lightingConfig.dirPositionZ = 100;
      lightingConfig.shadowRange = 1000;
      updateLighting();
      if (dirLight) {
        const range = 1000;
        dirLight.shadow.camera.left = -range;
        dirLight.shadow.camera.right = range;
        dirLight.shadow.camera.top = range;
        dirLight.shadow.camera.bottom = -range;
        dirLight.shadow.camera.far = 5000;
        dirLight.shadow.camera.updateProjectionMatrix();
      }
      updateSunPosition();
      toggleCarLights(true);
      if (carModel.userData.headlightMeshes) {
          carModel.userData.headlightMeshes.forEach(mesh => mesh.material.emissiveIntensity = 0);
      }
      if (carModel.userData.lightSources) {
          carModel.userData.lightSources.forEach(item => {
              if (item.type === 'head') item.light.intensity = 0;
          });
      }
      camera.near = 2.0;
      camera.far = 100000;
      camera.updateProjectionMatrix();
      if (scene.fog) {
        scene.fog.near = 5000;
        scene.fog.far = 150000;
      }

      let isTransitioning = false;

      Director.loadScenario((delta, timeInShot) => {
        // === LOOPING BALIK KE SCENE 1 ===
        if (timeInShot > 3 && !isTransitioning) {
             isTransitioning = true;
             console.log("🎬 Movie Loop! Back to City...");
             fadeOut(() => {
                 loadMap("1. City"); // Loop kembali ke awal
             });
             return;
        }

        if (Director.currentCut === null) {
          Director.cutTo("AU_Start");
          carSettings.autoDrive = true;
          carSettings.maxSpeed = 30.0;
        }

        if (Director.currentCut === "AU_Start") {
          if (timeInShot < 4.5) {
            camera.position.z += 40.0 * delta;
            if (carModel) {
              controls.target.copy(carModel.position);
              const panOffset = -10 + timeInShot * 10.0;
              controls.target.z += panOffset;
              controls.target.x -= 30;
            }
          }
          if (timeInShot > 3.5) {
            carSpeed = 0;
            carSettings.autoDrive = false;
            carSettings.maxSpeed = 0.0;
          }
        }
      });

      Director.play();
    });
  });
}
// --- REGISTRY  MAP---
const sceneRegistry = {
  "1. City": scene_City,
  "2. bridge_design": scene_BridgeDesign,
  "3. Highway": scene_Highway,
  "4. Mountain Road": scene_MountainRoad,
  "5. American Underpass:": scene_AmericanUnderpass,
  // "American Curve": scene_AmericanCurve
  // "American Underpass": scene_AmericanUnderpass,
  // "Coast Road & Rocks": scene_CoastRoadAndRocks,
  // "Reef & Coastal": scene_ReefCoast,
  // "Coast Tunnel": scene_CoastTunnel,
  // "Hokkaido Snowfield": scene_HokkaidoSnow,
  // "Road to Mestia": scene_Mestia,
  // "Road with Trees": scene_TreesRoad,
  // "Tunnel Road": scene_TunnelRoad,
  // "Desert road": scene_DesertRoad,
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
  shadowEnabled: true,
  shadowMapSize: 4096,
  shadowBias: -0.0005, // Bias sedikit negatif agar tidak ada artifacts
  shadowRadius: 1,
  shadowRange: 50, // Luas area bayangan
  targetX: 0, // Fokus cahaya X
  targetZ: 0, // Fokus cahaya Z
  shadowAutoUpdate: true,
  theme: "daylight",
};

function updateLighting() {
  // 1. Update Warna & Intensitas
  ambientLight.intensity = lightingConfig.ambientIntensity;
  ambientLight.color.set(lightingConfig.ambientColor);

  dirLight.intensity = lightingConfig.dirIntensity;
  dirLight.color.set(lightingConfig.dirColor);

  dirLight.position.set(lightingConfig.targetX + lightingConfig.dirPositionX, lightingConfig.dirPositionY, lightingConfig.targetZ + lightingConfig.dirPositionZ);

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
  // if (!window.shadowHelper) {
  //    window.shadowHelper = new THREE.CameraHelper(dirLight.shadow.camera);
  //    scene.add(window.shadowHelper);
  // }
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
  dirLight.position.set(centerPos.x + lightingConfig.dirPositionX, centerPos.y + lightingConfig.dirPositionY, centerPos.z + lightingConfig.dirPositionZ);

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
    lightingConfig.dirIntensity = 2.0;

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
    lightingConfig.dirColor = "#ff6600"; // Mengubah warna jadi merah
    lightingConfig.skyColor = "#ff9966";
    scene.background = new THREE.Color(0xff9966);
    if (scene.fog) scene.fog = null;
    updateLighting();
  },

  night: () => {
    lightingConfig.ambientIntensity = 0.2;
    lightingConfig.ambientColor = "#333366"; // Biru gelap
    lightingConfig.dirIntensity = 0.3;
    lightingConfig.dirColor = "#ffffff"; // Reset directional ke putih (atau biru muda)
    lightingConfig.skyColor = "#000033";
    scene.background = new THREE.Color(0x000033);
    if (scene.fog) scene.fog = null;
    updateLighting();
  },

  foggy: () => {
    lightingConfig.ambientIntensity = 0.6;
    lightingConfig.ambientColor = "#ffffff"; // Reset putih
    lightingConfig.dirIntensity = 0.8;
    lightingConfig.dirColor = "#ffffff"; // Reset putih

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
const camFolder = gui.addFolder("🎥 Camera Director");

const directorFolder = camFolder.addFolder("🎬 Action");
directorFolder.add(Director, "play").name("▶ Play Cinematic");
directorFolder.add(Director, "stop").name("⏹ Stop / Manual");
directorFolder.open();

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

  // 1. Update Mobil
  updateCar();

  // 2. Director System Update (Cinematics)
  if (Director.active) {
    Director.update(deltaSeconds);
  }
  // 3. Normal Controls Update
  else if (!carSettings.followCamera) {
    controls.update();
  }
  AutoShowcase.update(deltaSeconds);

  if (typeof updateSunPosition === "function") {
    updateSunPosition();
  }
  // Update Lighting Anim
  if (lightingConfig.environmentRotation !== 0) {
    const time = clock.getElapsedTime();
    hemisphereLight.position.x = Math.sin(time * 0.1) * 100;
    hemisphereLight.position.z = Math.cos(time * 0.1) * 100;
  }

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate(0);

// ==========================================
// 14. TRANSITION EFFECT (FADE CURTAIN)
// ==========================================

const fadeCurtain = document.getElementById("global-fade-curtain") || document.createElement("div");
if (!fadeCurtain.id) {
  fadeCurtain.id = "global-fade-curtain";
  fadeCurtain.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: #000; opacity: 1; pointer-events: none;
        transition: opacity 1.0s ease-in-out; z-index: 10000;
    `;
  document.body.appendChild(fadeCurtain);
}

// Fungsi untuk menggelapkan layar (keluar scene)
function fadeOut(callback) {
  fadeCurtain.style.opacity = "1"; // Layar jadi hitam
  setTimeout(() => {
    if (callback) callback(); // Load map baru saat gelap
  }, 1000); // Tunggu 1 detik
}

// Fungsi untuk menerangkan layar (masuk scene)
// Panggil ini di dalam coreLoadMap setelah model selesai diload
function fadeIn() {
  setTimeout(() => {
    fadeCurtain.style.opacity = "0"; // Layar jadi bening
  }, 100);
}

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