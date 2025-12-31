import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GUI } from 'three/addons/libs/lil-gui.module.min.js'

// ==========================================
// 1. INITIAL SETUP & SCENE CONFIGURATION
// ==========================================

// Scene
const scene = new THREE.Scene()
const skyColor = new THREE.Color(0x87CEEB)
scene.background = skyColor

// Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(30, 20, 30)
camera.up.set(0, 1, 0)

// Renderer
const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: true
})
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)

// Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.target.set(0, 5, 0)
controls.enabled = true
controls.update()

// Clock
const clock = new THREE.Clock()

// ==========================================
// 2. ADVANCED LIGHTING SYSTEM
// ==========================================

// Ambient Light
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0)
scene.add(ambientLight)

// Directional Light (Main Sun)
const dirLight = new THREE.DirectionalLight(0xffffff, 2.0)
dirLight.position.set(50, 100, 50)
dirLight.castShadow = true
dirLight.shadow.mapSize.width = 2048
dirLight.shadow.mapSize.height = 2048
dirLight.shadow.camera.near = 0.5
dirLight.shadow.camera.far = 500
dirLight.shadow.camera.left = -100
dirLight.shadow.camera.right = 100
dirLight.shadow.camera.top = 100
dirLight.shadow.camera.bottom = -100
scene.add(dirLight)

// Hemisphere Light
const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x8B4513, 0.5)
scene.add(hemisphereLight)

// Spot Light
const spotLight = new THREE.SpotLight(0xffffff, 1.0, 200, Math.PI / 6, 0.5, 2)
spotLight.position.set(30, 40, 30)
spotLight.castShadow = true
spotLight.shadow.mapSize.width = 1024
spotLight.shadow.mapSize.height = 1024
scene.add(spotLight)

// Point Light
const pointLight = new THREE.PointLight(0xff6600, 0.5, 50)
pointLight.position.set(-10, 5, -10)
scene.add(pointLight)

// ==========================================
// 3. LOADERS
// ==========================================

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

// ==========================================
// 4. GLOBAL VARIABLES
// ==========================================

let currentMapModel = null
let cameraTarget = new THREE.Object3D()
scene.add(cameraTarget)

// Car System
let carModel = null
let carWheels = []
let frontWheels = []
let pivotFL, pivotFR
let carSpeed = 0
let steeringAngle = 0
const raycaster = new THREE.Raycaster()
const downVector = new THREE.Vector3(0, -1, 0)

// Car Settings
const carSettings = {
    maxSpeed: 0.8,
    acceleration: 0.01,
    friction: 0.98,
    turnSpeed: 0.03,
    followCamera: true,
    autoDrive: false
}

// Keyboard Input
const keys = { w: false, a: false, s: false, d: false }

// Event Listener Keyboard
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase()
    keys[key] = true
    
    // Fitur Baru: Cek Koordinat dengan tombol 'P'
    if (key === 'p') {
        checkCoordinates()
    }
})

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false
})

// ==========================================
// 5. HELPER FUNCTIONS
// ==========================================

// Fungsi untuk mengecek koordinat
function checkCoordinates() {
    if (carModel) {
        const pos = carModel.position
        const rot = carModel.rotation
        
        console.log(`📍 COORDINATE REPORT:`)
        console.log(`Position: x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)}, z: ${pos.z.toFixed(2)}`)
        console.log(`Rotation Y: ${rot.y.toFixed(2)}`)
        console.log(`------------------------`)

        alert(`📍 Koordinat Mobil:\nX: ${pos.x.toFixed(2)}\nY: ${pos.y.toFixed(2)}\nZ: ${pos.z.toFixed(2)}\n\n(Cek Console F12 untuk copy)`)
    } else {
        console.warn("Mobil belum dimuat!")
    }
}

// ==========================================
// 6. CAR LOADING & ANIMATION SYSTEM
// ==========================================
function loadCar() {
    console.log("🚗 Memuat Mobil Nissan GT-R (Smart Offset)...")
    const carPath = './source/2018_nissan_gr.glb'

    gltfLoader.load(carPath, (gltf) => {
        carModel = gltf.scene
        
        // --- A. POSISI & ORIENTASI ---
        carModel.position.set(0, 0, 0)
        carModel.rotation.y = 0  // Menghadap depan
        
        // Update Matrix agar posisi wheel & brake akurat saat diambil nanti
        carModel.updateMatrixWorld(true) 

        // Reset variable container
        carWheels = []
        pivotFL = null
        pivotFR = null

        // --- B. FUNGSI PEMBANTU: SETUP SMART OFFSET ---
        // Fungsi ini kita taruh di dalam agar mudah akses carModel
        const setupFrontSystem = (wheelName, brakeName) => {
            const wheelMesh = carModel.getObjectByName(wheelName)
            const brakeMesh = carModel.getObjectByName(brakeName)

            if (wheelMesh && brakeMesh) {
                const pivot = new THREE.Group()
                
                // 1. Ambil posisi aslinya di dunia 3D
                const wheelPos = wheelMesh.position.clone()
                const brakePos = brakeMesh.position.clone()

                // 2. HITUNG JARAK (OFFSET) OTOMATIS
                // Rumus: Posisi Kaliper - Posisi Roda
                // Ini menjaga agar kaliper tetap di tempat aslinya, tidak ketarik ke tengah
                const offset = new THREE.Vector3().subVectors(brakePos, wheelPos)
                
                // 3. Pindahkan Pivot ke posisi roda
                pivot.position.copy(wheelPos)
                
                // 4. Attach Pivot ke Mobil
                carModel.add(pivot)
                
                // 5. Masukkan Roda & Rem ke dalam Pivot
                pivot.add(wheelMesh)
                pivot.add(brakeMesh)
                
                // 6. Reset Posisi (FINAL FIX)
                wheelMesh.position.set(0, 0, 0) // Roda pas di tengah as
                brakeMesh.position.copy(offset) // Kaliper ditaruh sesuai jarak aslinya
                
                // 7. Masukkan Roda ke array putar
                carWheels.push(wheelMesh)
                
                return pivot // Kembalikan pivot untuk kontrol steering
            } else {
                console.error(`❌ Part tidak ditemukan: ${wheelName} atau ${brakeName}`)
                return null
            }
        }

        // --- C. EKSEKUSI SETUP ---
        // Setup Roda Depan (Pakai Pivot & Smart Offset)
        pivotFL = setupFrontSystem('Roda_depan_kiri', 'Rem_depan_kiri')
        pivotFR = setupFrontSystem('Roda_depan_kanan', 'Rem_depan_kanan')

        // Setup Roda Belakang (Cukup ambil mesh untuk putar)
        const rodaRL = carModel.getObjectByName('Roda_belakang_kiri')
        const rodaRR = carModel.getObjectByName('Roda_belakang_kanan')
        
        // Pastikan kaliper belakang terbawa (untuk shadow/render)
        // Kita tidak perlu memanipulasi kaliper belakang karena dia statis
        
        if (rodaRL) carWheels.push(rodaRL)
        if (rodaRR) carWheels.push(rodaRR)

        // Setup Shadow
        carModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true
                child.receiveShadow = true
            }
        })

        scene.add(carModel)
        console.log("✅ Mobil Siap: Posisi & Kaliper Aman!")
        
    }, undefined, (err) => console.error("❌ Gagal load mobil:", err))
}

// ==========================================
// 3. FUNGSI UPDATE CAR (ANIMASI)
// ==========================================
function updateCar() {
    if (!carModel) return

    const currentScale = carModel.scale.x;

    // --- 1. Physics (Gas/Rem) ---
    if (carSettings.autoDrive) {
        if (carSpeed < carSettings.maxSpeed * 0.5) carSpeed += carSettings.acceleration
    } else {
        if (keys.w) carSpeed += carSettings.acceleration
        if (keys.s) carSpeed -= carSettings.acceleration
    }
    carSpeed *= carSettings.friction

    // --- 2. Steering Logic ---
    let targetSteering = 0
    if (Math.abs(carSpeed) > 0.01) {
        if (keys.a) {
            carModel.rotation.y += carSettings.turnSpeed
            targetSteering = 0.5
        }
        if (keys.d) {
            carModel.rotation.y -= carSettings.turnSpeed
            targetSteering = -0.5
        }
    }
    steeringAngle += (targetSteering - steeringAngle) * 0.1

    // --- 3. Movement ---
    carModel.translateZ(carSpeed * currentScale)

    // --- 4. Ground Logic ---
 if (currentMapModel) {
        const rayOrigin = carModel.position.clone()
        // Raycast origin juga harus menyesuaikan scale agar tidak tembus tanah saat mobil besar
        rayOrigin.y += (2 * currentScale) 
        
        raycaster.set(rayOrigin, downVector)
        const intersects = raycaster.intersectObject(currentMapModel, true)
        if (intersects.length > 0) {
            // Offset sedikit (0.1 * scale) agar ban tidak tenggelam
            carModel.position.y = intersects[0].point.y + (0.1 * currentScale)
        }
    }

    // ==========================================
    // --- 5. ANIMASI RODA (FINAL) ---
    // ==========================================

    // A. PUTAR BAN (MAJU) - Sumbu X
    // Hanya mesh roda yang berputar. Kaliper diam karena tidak masuk array ini.
    carWheels.forEach(ban => {
        ban.rotation.x += carSpeed * 10
    })

    // B. BELOKKAN PIVOT (STEER) - Sumbu Y
    // Pivot berisi (Roda + Kaliper). Keduanya ikut menoleh.
    if (pivotFL) pivotFL.rotation.y = steeringAngle
    if (pivotFR) pivotFR.rotation.y = steeringAngle

    // --- 6. Camera Follow ---
    if (carSettings.followCamera) {
        const relativeCameraOffset = new THREE.Vector3(0, cameraConfig.height, -cameraConfig.distance)
        const cameraOffset = relativeCameraOffset.applyMatrix4(carModel.matrixWorld)

        // Camera Collision (Opsional, sesuaikan dengan kodemu)
        if (cameraConfig.collisionEnabled) {
            const rayOrigin = carModel.position.clone()
            rayOrigin.y += 5
            const rayDirection = cameraOffset.clone().sub(rayOrigin).normalize()
            const rayDistance = rayOrigin.distanceTo(cameraOffset)
            raycaster.set(rayOrigin, rayDirection)
            const intersects = currentMapModel ? raycaster.intersectObject(currentMapModel, true) : []
            if (intersects.length > 0 && intersects[0].distance < rayDistance) {
                cameraOffset.copy(intersects[0].point).add(rayDirection.clone().multiplyScalar(-cameraConfig.collisionOffset))
            }
        }

        camera.position.lerp(cameraOffset, cameraConfig.damping)
        const targetLook = carModel.position.clone()
        targetLook.y += cameraConfig.lookAtY

        camera.lookAt(targetLook)
        controls.target.copy(targetLook)
        
        if (camera.fov !== cameraConfig.fov) {
             camera.fov = cameraConfig.fov
             camera.updateProjectionMatrix()
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
    'AU_Start': {
        pos: new THREE.Vector3(0, 2, 10),
        tgt: new THREE.Vector3(0, 0.5, 0),
        roll: new THREE.Vector3(0, 1, 0)
    },
    'AU_Side': {
        pos: new THREE.Vector3(5, 0.5, 0),
        tgt: new THREE.Vector3(0, 0.5, 0),
        roll: new THREE.Vector3(-0.2, 1, 0)
    },
    'AU_Top': {
        pos: new THREE.Vector3(0, 20, 0),
        tgt: new THREE.Vector3(0, 0, 5),
        roll: new THREE.Vector3(0, 0, 1)
    },
    // Shot untuk Coast Road
    'Coast_Intro': {
        pos: new THREE.Vector3(50, 10, 50),
        tgt: new THREE.Vector3(50, 5, 20),
        roll: new THREE.Vector3(0, 1, 0)
    },
    'Coast_Wheel': {
        pos: new THREE.Vector3(52, 1, 22),
        tgt: new THREE.Vector3(50, 0.5, 20),
        roll: new THREE.Vector3(0, 1, 0)
    }
};

// --- B. DIRECTOR ENGINE ---
// Mesin utama yang mengatur play/stop dan update sequence
const Director = {
active: false,
    currentCut: null,
    startTime: 0,
    scenarioUpdate: null,
    pendingScenario: null,

    loadScenario: function(scenarioFunc) {
        this.stop(); 
        this.pendingScenario = scenarioFunc; 
        console.log("🎬 Skenario siap. Klik 'Play Cinematic' untuk mulai.");
    },

    play: function() {
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

    cutTo: function(cutName) {
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

    stop: function() {
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

    update: function(delta) {
        if (!this.active || !this.scenarioUpdate) return;
        const timeInShot = clock.getElapsedTime() - this.startTime;
        const totalTime = clock.getElapsedTime();
        this.scenarioUpdate(delta, timeInShot, totalTime);
        camera.lookAt(controls.target);
    },
    playScenario: function(scenarioFunc) {
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
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) {
        loadingDiv.style.display = 'flex';
        loadingDiv.innerHTML = '<div class="spinner"></div><span>Memuat Scene...</span>';
    }

    if (currentMapModel) {
        scene.remove(currentMapModel);
        currentMapModel.traverse((child) => {
            if (child.isMesh) {
                if(child.material) child.material.dispose();
                if(child.geometry) child.geometry.dispose();
            }
        });
        currentMapModel = null;
    }

    // Stop previous cinematic if running
    Director.stop();
    Director.pendingScenario = null;

    if (fileName === 'test') {
        createTestModel();
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (onMapLoaded) onMapLoaded();
        return;
    }

    const path = `./env/${fileName}`;
    gltfLoader.load(path, (gltf) => {
        currentMapModel = gltf.scene;
        currentMapModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        scene.add(currentMapModel);
        
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (onMapLoaded) onMapLoaded();
        
        console.log(`✅ Map ${fileName} loaded!`);
    }, undefined, (err) => {
        console.error("Gagal load map:", err);
        if (loadingDiv) loadingDiv.style.display = 'none';
    });
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
    coreLoadMap('american_road_underpass_bridge.glb', () => {
        setSpawn(-1124, -15, -94, Math.PI/2);
        lightingThemes.daylight();

        scaleParams.autoScale = false; 
        
        
        
        // Update slider GUI agar sinkron
        if (scaleParams) scaleParams.size = 1.5;

        // LOGIKA CINEMATIC MAP INI
        Director.loadScenario((delta, timeInShot) => {
            
            // 1. START: Shot Belakang
            if (Director.currentCut === null) {
                Director.cutTo('AU_Start');
                carSettings.autoDrive = true;
                carSettings.maxSpeed = 0.5;
            }

            if (Director.currentCut === 'AU_Start') {
                camera.position.z += 1.5 * delta; // Efek dolly out
                if (timeInShot > 4.0) Director.cutTo('AU_Side');
            }

            // 2. Shot Samping
            else if (Director.currentCut === 'AU_Side') {
                if (carModel) {
                    // Kamera tracking samping
                    camera.position.x = carModel.position.x + 5;
                    camera.position.z = carModel.position.z;
                    controls.target.copy(carModel.position);
                }
                if (timeInShot > 4.0) Director.cutTo('AU_Top');
            }

            // 3. Shot Atas (Ending)
            else if (Director.currentCut === 'AU_Top') {
                carSettings.maxSpeed = 2.0; // Ngebut
                if (timeInShot > 4.0) Director.stop(); // Selesai
            }
        });
    });
}

function scene_AmericanCurve() {
    console.log("🎬 Map: American Curve");
    coreLoadMap('american_road_curve_ahead.glb', () => {
        setSpawn(-200, 427, -290, Math.PI); // Default spawn
        lightingThemes.daylight();
        //
        scaleParams.autoScale = false;
        if(carModel) carModel.scale.set(1.5, 1.5, 1.5);
        if (scaleParams) scaleParams.size = 1.5;

        //
        // Setup Basic Cinematic
        Director.loadScenario((delta, timeInShot) => {
            if (Director.currentCut === null) {
                // Gunakan preset kamera cinematic default jika belum ada cut khusus
                camPresets.cinematic();
                Director.currentCut = 'Intro'; 
            }
            // Intro 3 detik lalu main
            if (timeInShot > 3.0) Director.stop();
        });
    });
}

function scene_CoastRoadAndRocks() {
    console.log("🎬 Map: Coast Road");
    coreLoadMap('coast_road_and_rocks_ver2.0.glb', () => {
        setSpawn(-55, 13, 43.5, Math.PI / 2);
        lightingThemes.sunset()

        scaleParams.autoScale = false;
        if(carModel) carModel.scale.set(1, 1, 1);;
        if (scaleParams) scaleParams.size = 1;
        
        Director.loadScenario((delta, timeInShot) => {
            if (Director.currentCut === null) Director.cutTo('Coast_Intro');

            if (Director.currentCut === 'Coast_Intro') {
                controls.target.x += 2 * delta; // Panning
                if (timeInShot > 5) Director.cutTo('Coast_Wheel');
            }

            if (Director.currentCut === 'Coast_Wheel') {
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
    coreLoadMap('coast_road_tunnel_and_rock.glb', () => {
        setSpawn(106, 8, 0.5, Math.PI * 3/2); 
        lightingThemes.night(); 
    });
}

function scene_HokkaidoSnow() {
    console.log("🎬 Map: Hokkaido Snowfield");
    coreLoadMap('hokkaido_snowfield_mountain_road_and_forest.glb', () => {
        setSpawn(0, 2, 0, 0);
        lightingThemes.foggy(); // Tema salju
    });
}

function scene_MountainRoad() {
    console.log("🎬 Map: Mountain Road");
    coreLoadMap('mountain_road_scene.glb', () => {
        setSpawn(0, 2, 0, 0);
        lightingThemes.daylight();
    });
}

function scene_ReefCoast() {
    console.log("🎬 Map: Reef & Coastal");
    coreLoadMap('reef_and_coastal_road.glb', () => {
        setSpawn(0, 5, 0, 0);
        lightingThemes.clear(); // Laut cerah
    });
}

function scene_Highway() {
    console.log("🎬 Map: Highway");
    coreLoadMap('road__highway.glb', () => {
        setSpawn(0, 0.5, 0, 0);
        lightingThemes.daylight();
    });
}

function scene_Mestia() {
    console.log("🎬 Map: Road to Mestia");
    coreLoadMap('road_to_mestia_svaneti.glb', () => {
        setSpawn(0, 2, 0, 0);
        lightingThemes.foggy(); // Pegunungan berkabut
    });
}

function scene_TreesRoad() {
    console.log("🎬 Map: Road with Trees");
    coreLoadMap('road_with_trees.glb', () => {
        setSpawn(0, 0.5, 0, 0);
        lightingThemes.sunset(); // Bagus untuk efek cahaya sela pohon
    });
}

function scene_TunnelRoad() {
    console.log("🎬 Map: Tunnel Road");
    coreLoadMap('tunnel_road.glb', () => {
        setSpawn(0, 1, 0, 0);
        lightingThemes.night(); // Tunnel harus gelap
        // Nyalakan lampu mobil otomatis jika fitur ada
    });
}

function scene_TestMode() {
    coreLoadMap('test', () => {
        setSpawn(0, 0, 0, 0);
        lightingThemes.daylight();
        // Tidak ada cinematic, langsung main
    });
}

function scene_BridgeDesign() {
    coreLoadMap('bridge_design.glb', () => {
        setSpawn(0, 0, 0, 0);
        lightingThemes.daylight();
        // Tidak ada cinematic, langsung main
    });
}

function scene_City() {
    coreLoadMap('city_for_my_game.glb', () => {
        setSpawn(100, -10, -255, Math.PI * 2 - 0.1);
        lightingThemes.daylight();
        // Tidak ada cinematic, langsung main
    });
}

function scene_DesertRoad() {
    coreLoadMap('desert_road_segment_scan.glb', () => {
        setSpawn(0, 500, 0, 0);
        lightingThemes.daylight();
        // Tidak ada cinematic, langsung main
    });
}

// --- REGISTRY  MAP---
const sceneRegistry = {
    'American Underpass': scene_AmericanUnderpass,
    'American Curve': scene_AmericanCurve,
    'Coast Road & Rocks': scene_CoastRoadAndRocks,
    'Coast Tunnel': scene_CoastTunnel,
    'Hokkaido Snowfield': scene_HokkaidoSnow,
    'Mountain Road': scene_MountainRoad,
    'Reef & Coastal': scene_ReefCoast,
    'Highway': scene_Highway,
    'Road to Mestia': scene_Mestia,
    'Road with Trees': scene_TreesRoad,
    'Tunnel Road': scene_TunnelRoad,
    'bridge_design': scene_BridgeDesign,
    'City': scene_City,
    'Desert road': scene_DesertRoad,
    'Test Mode (Debug)': scene_TestMode
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
    console.log("📦 Membuat test model...")
    const testModel = new THREE.Group()

    // Road
    const roadGeometry = new THREE.PlaneGeometry(40, 300)
    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333, roughness: 0.8, metalness: 0.2
    })
    const road = new THREE.Mesh(roadGeometry, roadMaterial)
    road.rotation.x = -Math.PI / 2
    road.receiveShadow = true
    testModel.add(road)

    // Markings
    const lineGeometry = new THREE.PlaneGeometry(0.5, 300)
    const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 })
    const line = new THREE.Mesh(lineGeometry, lineMaterial)
    line.rotation.x = -Math.PI / 2
    line.position.y = 0.01
    testModel.add(line)

    // Grid
    const gridHelper = new THREE.GridHelper(300, 60, 0x888888, 0x444444)
    gridHelper.position.y = 0.01
    testModel.add(gridHelper)

    currentMapModel = testModel
    scene.add(currentMapModel)
}

function detectRoadWidth() {
    if (!carModel || !currentMapModel) return 0

    const samplePoints = 5
    let totalWidth = 0
    let validSamples = 0

    for (let i = 0; i < samplePoints; i++) {
        // Ambil sampel di depan/belakang mobil
        const offsetZ = i * 2 - (samplePoints * 2) / 2
        const samplePos = carModel.position.clone()
        samplePos.z += offsetZ

        // Deteksi Sisi Kiri
        const leftRayOrigin = samplePos.clone()
        leftRayOrigin.x -= 50 // Mulai dari jauh di kiri
        leftRayOrigin.y += 20

        // Kita scan area bawah
        raycaster.set(leftRayOrigin, downVector)
        // Cari titik temu pertama dengan map
        const leftIntersects = raycaster.intersectObject(currentMapModel, true)

        // Deteksi Sisi Kanan
        const rightRayOrigin = samplePos.clone()
        rightRayOrigin.x += 50 // Mulai dari jauh di kanan
        rightRayOrigin.y += 20

        raycaster.set(rightRayOrigin, downVector)
        const rightIntersects = raycaster.intersectObject(currentMapModel, true)

        // Jika dua-duanya kena tanah/jalan
        if (leftIntersects.length > 0 && rightIntersects.length > 0) {
            const leftPoint = leftIntersects[0].point
            const rightPoint = rightIntersects[0].point
            
            // Hitung jarak (Lebar jalan perkiraan)
            // Note: Ini logika sederhana, mengasumsikan map di bawah mobil adalah jalan
            const width = Math.abs(leftPoint.x - rightPoint.x)

            // Filter hasil yang aneh (misal terlalu lebar > 100m)
            if (width < 50) { 
                totalWidth += width
                validSamples++
            }
        }
    }

    return validSamples > 0 ? totalWidth / validSamples : 0
}

function autoScaleCarForMap() {
    if (!carModel || !currentMapModel) return

    console.log("📏 Auto-scaling mobil untuk map...")

    const roadWidth = detectRoadWidth()
    
    // Default fallback jika gagal deteksi
    let finalScale = 1.0; 

    if (roadWidth > 0) {
        const optimalCarWidth = 2.0 // Lebar mobil rata-rata
        const optimalRoadWidth = 4.0 // Lebar jalur standar
        
        // Rumus: Sesuaikan ukuran mobil berdasarkan rasio lebar jalan yang terdeteksi
        // Faktor 1.2 adalah adjustment agar mobil tidak terlalu kecil
        const scaleFactor = (roadWidth / optimalRoadWidth) * 0.8 

        const minScale = 0.3
        const maxScale = 3.0
        finalScale = THREE.MathUtils.clamp(scaleFactor, minScale, maxScale)

        console.log(`✅ Deteksi Jalan: ${roadWidth.toFixed(2)}m -> Scale: ${finalScale.toFixed(2)}x`)
    } else {
        console.warn("⚠️ Gagal deteksi lebar jalan, menggunakan scale default.");
    }

    // Terapkan Scale
    carModel.scale.set(finalScale, finalScale, finalScale)
    
    // Update GUI agar slider ikut berubah
    if (scaleParams) scaleParams.size = finalScale;
}

// ==========================================
// 10. CAMERA CONFIGURATION SYSTEM
// ==========================================

const cameraConfig = {
    distance: 12, height: 6, lookAtY: 0,
    fov: 60, damping: 0.1,
    collisionEnabled: true, collisionOffset: 2,
    minDistance: 2, maxDistance: 100,
    minPolarAngle: 0, maxPolarAngle: Math.PI,
    enablePan: true, enableRotate: true, enableZoom: true
}

function updateOrbitControls() {
    controls.minDistance = cameraConfig.minDistance
    controls.maxDistance = cameraConfig.maxDistance
    controls.minPolarAngle = cameraConfig.minPolarAngle
    controls.maxPolarAngle = cameraConfig.maxPolarAngle
    controls.enablePan = cameraConfig.enablePan
    controls.enableRotate = cameraConfig.enableRotate
    controls.enableZoom = cameraConfig.enableZoom
}
updateOrbitControls()

// ==========================================
// 11. LIGHTING CONFIGURATION SYSTEM
// ==========================================

const lightingConfig = {
    ambientIntensity: 1.0, ambientColor: '#ffffff',
    dirIntensity: 2.0, dirColor: '#ffffff',
    dirPositionX: 50, dirPositionY: 100, dirPositionZ: 50,
    hemisphereIntensity: 0.5, skyColor: '#87CEEB', groundColor: '#8B4513',
    spotIntensity: 1.0, spotColor: '#ffffff',
    spotDistance: 200, spotAngle: 30, spotPenumbra: 0.5, spotDecay: 2,
    pointIntensity: 0.5, pointColor: '#ff6600', pointDistance: 50,
    shadowEnabled: true, shadowMapSize: 2048, shadowBias: -0.0001, shadowRadius: 1,
    theme: 'daylight'
}

function updateLighting() {
    ambientLight.intensity = lightingConfig.ambientIntensity
    ambientLight.color.set(lightingConfig.ambientColor)
    dirLight.intensity = lightingConfig.dirIntensity
    dirLight.color.set(lightingConfig.dirColor)
    dirLight.position.set(lightingConfig.dirPositionX, lightingConfig.dirPositionY, lightingConfig.dirPositionZ)
    hemisphereLight.intensity = lightingConfig.hemisphereIntensity
    hemisphereLight.color.set(lightingConfig.skyColor)
    hemisphereLight.groundColor.set(lightingConfig.groundColor)
    spotLight.intensity = lightingConfig.spotIntensity
    spotLight.color.set(lightingConfig.spotColor)
    spotLight.distance = lightingConfig.spotDistance
    spotLight.angle = THREE.MathUtils.degToRad(lightingConfig.spotAngle)
    spotLight.penumbra = lightingConfig.spotPenumbra
    spotLight.decay = lightingConfig.spotDecay
    pointLight.intensity = lightingConfig.pointIntensity
    pointLight.color.set(lightingConfig.pointColor)
    pointLight.distance = lightingConfig.pointDistance
    dirLight.castShadow = lightingConfig.shadowEnabled
    spotLight.castShadow = lightingConfig.shadowEnabled
    renderer.shadowMap.enabled = lightingConfig.shadowEnabled
}
updateLighting()

// Themes
const lightingThemes = {
    daylight: () => {
        lightingConfig.ambientIntensity = 1.0; lightingConfig.dirIntensity = 2.0;
        lightingConfig.skyColor = '#87CEEB'; scene.background = new THREE.Color(0x87CEEB);
        if (scene.fog) scene.fog = null; updateLighting();
    },
    sunset: () => {
        lightingConfig.ambientIntensity = 0.8; lightingConfig.ambientColor = '#ffcc99';
        lightingConfig.dirIntensity = 1.5; lightingConfig.dirColor = '#ff6600';
        lightingConfig.skyColor = '#ff9966'; scene.background = new THREE.Color(0xff9966);
        if (scene.fog) scene.fog = null; updateLighting();
    },
    night: () => {
        lightingConfig.ambientIntensity = 0.2; lightingConfig.ambientColor = '#333366';
        lightingConfig.dirIntensity = 0.3; lightingConfig.skyColor = '#000033';
        scene.background = new THREE.Color(0x000033);
        if (scene.fog) scene.fog = null; updateLighting();
    },
    foggy: () => {
        lightingConfig.ambientIntensity = 0.6; lightingConfig.dirIntensity = 0.8;
        scene.fog = new THREE.Fog(0xaaaaaa, 10, 100); scene.background = new THREE.Color(0xaaaaaa);
        updateLighting();
    },
    clear: () => { scene.fog = null; lightingThemes.daylight(); }
}

// ==========================================
// 12. GUI CONTROL PANEL
// ==========================================

const gui = new GUI({ title: "🎬 DIRECTOR SETTINGS", width: 380 })

// Map Selector (UPDATED)
const mapFolder = gui.addFolder('🗺️ Map Selector')
const mapControls = {
    selectedMap: 'Test Mode (Debug)',
    loadMap: function() { loadMap(this.selectedMap) }
}
// Menggunakan keys dari sceneRegistry agar dinamis
mapFolder.add(mapControls, 'selectedMap', Object.keys(sceneRegistry)).onChange(() => mapControls.loadMap())
mapFolder.add(mapControls, 'loadMap').name('🔄 Load Map Sekarang')
mapFolder.open()

// Car Controls
const carFolder = gui.addFolder('🏎️ Car Control')
carFolder.add(carSettings, 'followCamera').name('🎥 Camera Follow')
carFolder.add(carSettings, 'autoDrive').name('🤖 Auto Pilot')
carFolder.add(carSettings, 'maxSpeed', 0.1, 3.0).name('🚀 Max Speed').step(0.1)
carFolder.add(carSettings, 'turnSpeed', 0.01, 0.1).name('🔄 Turn Speed').step(0.01)
carFolder.add({ getCoords: checkCoordinates }, 'getCoords').name('📍 Cek Koordinat (P)')

// Scale
const scaleParams = { size: 1, autoScale: true, lastAutoScale: 1 }
carFolder.add(scaleParams, 'size', 0.1, 20).name('📏 Manual Scale').step(0.1).onChange((val) => {
    if (carModel && !scaleParams.autoScale) carModel.scale.set(val, val, val)
})
carFolder.add(scaleParams, 'autoScale').name('⚡ Auto Scale')

// Reset Car (UPDATED)
carFolder.add({
    resetCar: () => {
        if (carModel) {
            carModel.position.set(currentSpawnInfo.x, currentSpawnInfo.y, currentSpawnInfo.z)
            carModel.rotation.set(0, currentSpawnInfo.rot, 0)
            carSpeed = 0
            steeringAngle = 0
            if (scaleParams.autoScale && currentMapModel) setTimeout(() => autoScaleCarForMap(), 100)
        }
    }
}, 'resetCar').name('🔄 Reset Car Position')
carFolder.open()

// Camera Presets
const camPresets = {
    default: () => { cameraConfig.distance = 12; cameraConfig.height = 6; cameraConfig.fov = 60; cameraConfig.lookAtY = 0; },
    topDown: () => { cameraConfig.distance = 1; cameraConfig.height = 30; cameraConfig.fov = 60; cameraConfig.lookAtY = -10; },
    racing: () => { cameraConfig.distance = 6; cameraConfig.height = 2; cameraConfig.fov = 80; cameraConfig.lookAtY = 1; },
    cinematic: () => { cameraConfig.distance = 20; cameraConfig.height = 3; cameraConfig.fov = 40; cameraConfig.lookAtY = 0; },
    driverView: () => { cameraConfig.distance = 3; cameraConfig.height = 1.5; cameraConfig.fov = 70; cameraConfig.lookAtY = 1; },
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
    }
}

const camFolder = gui.addFolder('🎥 Camera Director')

const directorFolder = camFolder.addFolder('🎬 Action')
directorFolder.add(Director, 'play').name('▶ Play Cinematic')
directorFolder.add(Director, 'stop').name('⏹ Stop / Manual')
directorFolder.open()
const presetFolder = camFolder.addFolder('📸 Camera Presets')
presetFolder.add(camPresets, 'default').name('🎯 Normal View')
presetFolder.add(camPresets, 'topDown').name('🛰️ Top Down')
presetFolder.add(camPresets, 'racing').name('🏁 Racing')
presetFolder.add(camPresets, 'cinematic').name('🎬 Cinematic')
presetFolder.add(camPresets, 'driverView').name('👨‍✈️ Driver View')
presetFolder.add(camPresets, 'wheelCinematic').name('🛞 Wheel Shot (Cinematic)')

const followCamFolder = camFolder.addFolder('📡 Follow Camera')
followCamFolder.add(carSettings, 'followCamera').name('Enabled')
followCamFolder.add(cameraConfig, 'distance', 2, 50).name('Distance').step(1)
followCamFolder.add(cameraConfig, 'height', 1, 30).name('Height').step(1)
followCamFolder.add(cameraConfig, 'lookAtY', -5, 10).name('LookAt Y').step(0.5)
// Removed Roll control to prevent confusion
followCamFolder.add(cameraConfig, 'fov', 30, 120).name('Field of View').step(5)
followCamFolder.add(cameraConfig, 'damping', 0.01, 1.0).name('Smoothness').step(0.01)
followCamFolder.add(cameraConfig, 'collisionEnabled').name('Collision Avoidance')
followCamFolder.add(cameraConfig, 'collisionOffset', 1, 10).name('Collision Offset').step(0.5)

// Orbit Controls
const orbitFolder = camFolder.addFolder('🔄 Orbit Controls')
orbitFolder.add(cameraConfig, 'enableRotate').name('Enable Rotation')
orbitFolder.add(cameraConfig, 'enableZoom').name('Enable Zoom')
orbitFolder.add(cameraConfig, 'enablePan').name('Enable Pan')
orbitFolder.add(cameraConfig, 'minDistance', 1, 50).name('Min Distance').step(1)
orbitFolder.add(cameraConfig, 'maxDistance', 10, 200).name('Max Distance').step(10)
camFolder.open()

// Lighting
const lightFolder = gui.addFolder('💡 Lighting System')
// Ambient Light
const ambientFolder = lightFolder.addFolder('🌤️ Ambient Light')
ambientFolder.add(lightingConfig, 'ambientIntensity', 0, 3).name('Intensity').step(0.1).onChange(updateLighting)
ambientFolder.addColor(lightingConfig, 'ambientColor').name('Color').onChange(updateLighting)

// Directional Light
const dirFolder = lightFolder.addFolder('☀️ Directional Light')
dirFolder.add(lightingConfig, 'dirIntensity', 0, 5).name('Intensity').step(0.1).onChange(updateLighting)
dirFolder.addColor(lightingConfig, 'dirColor').name('Color').onChange(updateLighting)
dirFolder.add(lightingConfig, 'dirPositionX', -200, 200).name('Position X').step(10).onChange(updateLighting)
dirFolder.add(lightingConfig, 'dirPositionY', -200, 200).name('Position Y').step(10).onChange(updateLighting)
dirFolder.add(lightingConfig, 'dirPositionZ', -200, 200).name('Position Z').step(10).onChange(updateLighting)

// Hemisphere Light
const hemiFolder = lightFolder.addFolder('🌎 Hemisphere Light')
hemiFolder.add(lightingConfig, 'hemisphereIntensity', 0, 2).name('Intensity').step(0.1).onChange(updateLighting)
hemiFolder.addColor(lightingConfig, 'skyColor').name('Sky Color').onChange(updateLighting)
hemiFolder.addColor(lightingConfig, 'groundColor').name('Ground Color').onChange(updateLighting)

// Spot Light
const spotFolder = lightFolder.addFolder('🔦 Spot Light')
spotFolder.add(lightingConfig, 'spotIntensity', 0, 5).name('Intensity').step(0.1).onChange(updateLighting)
spotFolder.addColor(lightingConfig, 'spotColor').name('Color').onChange(updateLighting)
spotFolder.add(lightingConfig, 'spotDistance', 0, 500).name('Distance').step(10).onChange(updateLighting)
spotFolder.add(lightingConfig, 'spotAngle', 1, 60).name('Angle').step(1).onChange(updateLighting)

// Shadows
const shadowFolder = lightFolder.addFolder('🌑 Shadows')
shadowFolder.add(lightingConfig, 'shadowEnabled').name('Enabled').onChange(updateLighting)
shadowFolder.add(lightingConfig, 'shadowMapSize', [512, 1024, 2048, 4096]).name('Quality').onChange(updateLighting)
shadowFolder.add(lightingConfig, 'shadowBias', -0.001, 0.001).name('Bias').step(0.0001).onChange(updateLighting)
shadowFolder.add(lightingConfig, 'shadowRadius', 0, 5).name('Softness').step(0.1).onChange(updateLighting)

// Lighting Themes
const themeFolder = lightFolder.addFolder('🎨 Lighting Themes')
themeFolder.add({ theme: 'daylight' }, 'theme', ['daylight', 'sunset', 'night', 'foggy', 'clear'])
    .name('Select Theme').onChange((val) => lightingThemes[val]())

lightFolder.open()

const perfFolder = gui.addFolder('⚡ Performance')
perfFolder.add(renderer.shadowMap, 'enabled').name('Shadows')
perfFolder.add(renderer.shadowMap, 'type', [THREE.BasicShadowMap, THREE.PCFShadowMap, THREE.PCFSoftShadowMap])
    .name('Shadow Type')
    .onChange((val) => {
        renderer.shadowMap.type = val
    })

perfFolder.add({ antialias: true }, 'antialias').name('Antialiasing').onChange((val) => {
    renderer.setPixelRatio(val ? window.devicePixelRatio : 1)
})

perfFolder.add({ fps: 60 }, 'fps', [30, 60, 120]).name('Target FPS').onChange((val) => {
    console.log(`Target FPS set to: ${val}`)
})


// ==========================================
// 13. INITIALIZATION & ANIMATION LOOP
// ==========================================

loadCar()

// Auto-start
setTimeout(() => {
    loadMap('Test Mode (Debug)')
    console.log("✅ Sistem siap. Gunakan WASD.")
}, 100)

let lastTime = 0
const targetFPS = 60
const frameInterval = 1000 / targetFPS

function animate(currentTime) {
    requestAnimationFrame(animate)

    const deltaTime = currentTime - lastTime
    if (deltaTime < frameInterval) return
    lastTime = currentTime - (deltaTime % frameInterval)
    const deltaSeconds = deltaTime / 1000;

    // 1. Update Mobil
    updateCar()

    // 2. Director System Update (Cinematics)
    if (Director.active) {
        Director.update(deltaSeconds)
    } 
    // 3. Normal Controls Update
    else if (!carSettings.followCamera) {
        controls.update()
    }

    // Update Lighting Anim
    if (lightingConfig.environmentRotation !== 0) {
        const time = clock.getElapsedTime()
        hemisphereLight.position.x = Math.sin(time * 0.1) * 100
        hemisphereLight.position.z = Math.cos(time * 0.1) * 100
    }

    renderer.render(scene, camera)
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
})

animate(0)

// Helper HTML Loading
const loadingDiv = document.createElement('div')
loadingDiv.id = 'loading'
loadingDiv.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: #transparent; color: #fff; display: flex; flex-direction: column;
    align-items: center; justify-content: center; z-index: 9999;
`
loadingDiv.innerHTML = '<span>Memuat Engine...</span>'
document.body.appendChild(loadingDiv)

setTimeout(() => {
    if (loadingDiv) loadingDiv.style.display = 'none'
}, 3000)