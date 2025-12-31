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
// 5. HELPER FUNCTIONS (NEW FEATURES)
// ==========================================

// Fungsi untuk mengecek koordinat (Dipanggil via tombol P atau GUI)
function checkCoordinates() {
    if (carModel) {
        const pos = carModel.position
        const rot = carModel.rotation
        
        // Log ke console agar mudah di-copy
        console.log(`📍 COORDINATE REPORT:`)
        console.log(`Position: x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)}, z: ${pos.z.toFixed(2)}`)
        console.log(`Rotation Y: ${rot.y.toFixed(2)}`)
        console.log(`------------------------`)

        // Tampilkan alert untuk feedback langsung
        alert(`📍 Koordinat Mobil:\nX: ${pos.x.toFixed(2)}\nY: ${pos.y.toFixed(2)}\nZ: ${pos.z.toFixed(2)}\n\n(Cek Console F12 untuk copy)`)
    } else {
        console.warn("Mobil belum dimuat!")
    }
}

// ==========================================
// 6. CAR LOADING & ANIMATION SYSTEM
// ==========================================

function loadCar() {
    console.log("🚗 Memuat Mobil Nissan GT-R...")
    const carPath = './source/2018_nissan_gr.glb'

    gltfLoader.load(carPath, (gltf) => {
        carModel = gltf.scene
        carModel.position.set(0, 0.5, 0)
        carModel.rotation.y = Math.PI

        // Reset arrays
        carWheels = []
        frontWheels = []

        // Wheel Detection
        const rodaFL = carModel.getObjectByName('Roda_depan_kiri')
        const rodaFR = carModel.getObjectByName('Roda_depan_kanan')
        const rodaRL = carModel.getObjectByName('Roda_belakang_kiri')
        const rodaRR = carModel.getObjectByName('Roda_belakang_kanan')

        // Front Wheels
        if (rodaFL) {
            carWheels.push(rodaFL)
            frontWheels.push(rodaFL)
        }
        if (rodaFR) {
            carWheels.push(rodaFR)
            frontWheels.push(rodaFR)
        }
        // Rear Wheels
        if (rodaRL) carWheels.push(rodaRL)
        if (rodaRR) carWheels.push(rodaRR)

        // Shadows
        carModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true
                child.receiveShadow = true
            }
        })

        scene.add(carModel)
        console.log("✅ Mobil berhasil dimuat!")
    }, undefined, (err) => console.error("❌ Gagal load mobil:", err))
}

function updateCar() {
    if (!carModel) return

    // 1. Physics
    if (carSettings.autoDrive) {
        if (carSpeed < carSettings.maxSpeed * 0.5) carSpeed += carSettings.acceleration
    } else {
        if (keys.w) carSpeed += carSettings.acceleration
        if (keys.s) carSpeed -= carSettings.acceleration
    }
    carSpeed *= carSettings.friction

    // 2. Steering
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

    // Smooth Steering
    steeringAngle += (targetSteering - steeringAngle) * 0.1

    // 3. Movement
    carModel.translateZ(carSpeed)

    // 4. Ground Raycasting
    if (currentMapModel) {
        const rayOrigin = carModel.position.clone()
        rayOrigin.y += 50
        raycaster.set(rayOrigin, downVector)
        const intersects = raycaster.intersectObject(currentMapModel, true)

        if (intersects.length > 0) {
            const groundHeight = intersects[0].point.y
            carModel.position.y = groundHeight + 0.15
        } else {
            carModel.position.y -= 0.5
        }
    }

    // 5. Wheel Animation
    carWheels.forEach(w => {
        w.rotation.x += carSpeed * 10
    })

    frontWheels.forEach(w => {
        w.rotation.order = 'YXZ'
        w.rotation.y = steeringAngle
    })

    // 6. Camera Follow (FIXED POV - NO EXTRA ROTATION)
    if (carSettings.followCamera) {
        // Hitung posisi kamera di belakang mobil
        const relativeCameraOffset = new THREE.Vector3(0, cameraConfig.height, -cameraConfig.distance)
        const cameraOffset = relativeCameraOffset.applyMatrix4(carModel.matrixWorld)

        // Camera Collision Logic
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

        // Apply Posisi (Damping agar halus)
        camera.position.lerp(cameraOffset, cameraConfig.damping)

        // Target Pandangan (Selalu melihat mobil)
        const targetLook = carModel.position.clone()
        targetLook.y += cameraConfig.lookAtY

        // REVISI: Hapus camera.rotation.z (Roll) agar kamera tidak miring saat belok
        // REVISI: Kamera hanya melihat target (LookAt), tidak ditambah rotasi ekstra
        camera.lookAt(targetLook)
        
        // Pastikan horizon tetap rata
        camera.up.set(0, 1, 0)

        // Update target orbit controls agar transisi mulus jika user mematikan follow cam
        controls.target.copy(targetLook)

        // Update FOV jika berubah dari GUI
        if (camera.fov !== cameraConfig.fov) {
            camera.fov = cameraConfig.fov
            camera.updateProjectionMatrix()
        }
    }
}

// ==========================================
// 7. MAP SYSTEM
// ==========================================

const mapList = {
    'American Underpass': 'american_road_underpass_bridge.glb',
    'Coast Road & Rocks 1': 'coast_road_and_rocks_ver2.0.glb',
    'Coast Tunnel & Rock': 'coast_road_tunnel_and_rock.glb',
    'Hokkaido Snowfield': 'hokkaido_snowfield_mountain_road_and_forest.glb',
    'Mountain Road Scene': 'mountain_road_scene.glb',
    'Reef & Coastal Road': 'reef_and_coastal_road.glb',
    'Road Highway': 'road__highway.glb',
    'Road with Trees': 'road_with_trees.glb',
    'American Curve': 'american_road_curve_ahead.glb',
    'Test Model (Debug)': 'test',
    'Tanpa Map (Default)': 'default'
}

function createTestModel() {
    console.log("📦 Membuat test model...")

    if (currentMapModel) {
        scene.remove(currentMapModel)
        currentMapModel.traverse((child) => {
            if (child.isMesh) {
                if (child.material) child.material.dispose()
                if (child.geometry) child.geometry.dispose()
            }
        })
        currentMapModel = null
    }

    const testModel = new THREE.Group()

    // Road
    const roadGeometry = new THREE.PlaneGeometry(40, 300)
    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.8,
        metalness: 0.2
    })
    const road = new THREE.Mesh(roadGeometry, roadMaterial)
    road.rotation.x = -Math.PI / 2
    road.receiveShadow = true
    testModel.add(road)

    // Road Markings
    const lineGeometry = new THREE.PlaneGeometry(0.5, 300)
    const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 })
    const line = new THREE.Mesh(lineGeometry, lineMaterial)
    line.rotation.x = -Math.PI / 2
    line.position.y = 0.01
    testModel.add(line)

    // Trees
    const treeGeometry = new THREE.CylinderGeometry(0.5, 1, 5, 8)
    const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x5D4037 })

    for (let i = 0; i < 30; i++) {
        const tree = new THREE.Mesh(treeGeometry, treeMaterial)
        tree.position.x = (Math.random() - 0.5) * 60
        tree.position.z = (Math.random() - 0.5) * 280
        tree.position.y = 2.5
        tree.castShadow = true
        testModel.add(tree)

        const leafGeometry = new THREE.ConeGeometry(3, 6, 8)
        const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x2E7D32 })
        const leaf = new THREE.Mesh(leafGeometry, leafMaterial)
        leaf.position.y = 4
        leaf.castShadow = true
        tree.add(leaf)
    }

    // Grid Helper
    const gridHelper = new THREE.GridHelper(300, 60, 0x888888, 0x444444)
    gridHelper.position.y = 0.01
    testModel.add(gridHelper)

    currentMapModel = testModel
    scene.add(currentMapModel)
    console.log("✅ Test model created!")
}

// ==========================================
// 8. AUTO-SCALING SYSTEM
// ==========================================

function autoScaleCarForMap() {
    if (!carModel || !currentMapModel) return

    console.log("📏 Auto-scaling mobil untuk map...")

    const roadWidth = detectRoadWidth()
    if (roadWidth > 0) {
        const optimalCarWidth = 2.0
        const optimalRoadWidth = 4.0
        const scaleFactor = (roadWidth / optimalRoadWidth) * 1.2

        const minScale = 0.3
        const maxScale = 3.0
        const finalScale = THREE.MathUtils.clamp(scaleFactor, minScale, maxScale)

        carModel.scale.set(finalScale, finalScale, finalScale)
        scaleParams.size = finalScale

        console.log(`✅ Mobil di-scale ke: ${finalScale.toFixed(2)}x (lebar jalan: ${roadWidth.toFixed(2)}m)`)
    }
}

function detectRoadWidth() {
    if (!carModel || !currentMapModel) return 0

    const samplePoints = 5
    let totalWidth = 0
    let validSamples = 0

    for (let i = 0; i < samplePoints; i++) {
        const offsetZ = i * 2 - (samplePoints * 2) / 2
        const samplePos = carModel.position.clone()
        samplePos.z += offsetZ

        // Left side detection
        const leftRayOrigin = samplePos.clone()
        leftRayOrigin.x -= 50
        leftRayOrigin.y += 20

        raycaster.set(leftRayOrigin, downVector)
        const leftIntersects = raycaster.intersectObject(currentMapModel, true)

        // Right side detection
        const rightRayOrigin = samplePos.clone()
        rightRayOrigin.x += 50
        rightRayOrigin.y += 20

        raycaster.set(rightRayOrigin, downVector)
        const rightIntersects = raycaster.intersectObject(currentMapModel, true)

        if (leftIntersects.length > 0 && rightIntersects.length > 0) {
            const leftPoint = leftIntersects[0].point
            const rightPoint = rightIntersects[0].point
            const width = Math.abs(leftPoint.x - rightPoint.x)

            totalWidth += width
            validSamples++
        }
    }

    return validSamples > 0 ? totalWidth / validSamples : 0
}

function loadMap(fileName) {
    console.log(`🚀 Loading map: ${fileName}`)

    const loadingDiv = document.getElementById('loading')
    if (loadingDiv) loadingDiv.style.display = 'none'

    // Clean up previous map
    if (currentMapModel) {
        scene.remove(currentMapModel)
        currentMapModel.traverse((child) => {
            if (child.isMesh) {
                if (child.material) child.material.dispose()
                if (child.geometry) child.geometry.dispose()
            }
        })
        currentMapModel = null
    }

    // Special cases
    if (fileName === 'test') {
        createTestModel()
        setTimeout(() => autoScaleCarForMap(), 500)
        return
    }
    if (fileName === 'default') return

    // Show loading screen
    if (loadingDiv) {
        loadingDiv.style.display = 'flex'
        loadingDiv.innerHTML = '<div class="spinner"></div><span>Memuat Model...</span>'
    }

    const possiblePaths = [
        fileName,
        `./${fileName}`,
        `/${fileName}`,
        `../${fileName}`,
        `source/${fileName}`,
        `./source/${fileName}`
    ]

    function tryLoad(pathIndex) {
        if (pathIndex >= possiblePaths.length) {
            console.error(`❌ Gagal load model: ${fileName}`)
            if (loadingDiv) loadingDiv.style.display = 'none'
            createTestModel()
            return
        }

        const path = possiblePaths[pathIndex]
        console.log(`🔍 Mencoba load dari: ${path}`)

        gltfLoader.load(path,
            (gltf) => {
                console.log(`✅ Sukses load: ${path}`)
                currentMapModel = gltf.scene

                // Optimize model
                currentMapModel.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true
                        child.receiveShadow = true
                    }
                })

                // Center the map
                const bbox = new THREE.Box3().setFromObject(currentMapModel)
                const center = bbox.getCenter(new THREE.Vector3())

                currentMapModel.position.x = -center.x
                currentMapModel.position.y = -bbox.min.y
                currentMapModel.position.z = -center.z

                scene.add(currentMapModel)

                // Reset car position
                if (carModel) {
                    carModel.position.set(0, 10, 0)
                    carModel.rotation.set(0, Math.PI, 0)
                    carSpeed = 0

                    // Auto-scale for this map
                    setTimeout(() => autoScaleCarForMap(), 500)
                }

                if (loadingDiv) loadingDiv.style.display = 'none'
            },
            (xhr) => {
                if (loadingDiv && xhr.lengthComputable) {
                    const percent = (xhr.loaded / xhr.total * 100).toFixed(1)
                    loadingDiv.innerHTML = `<div class="spinner"></div><span>Memuat ${percent}%</span>`
                }
            },
            (error) => {
                console.warn(`❌ Gagal load dari ${path}:`, error)
                tryLoad(pathIndex + 1)
            }
        )
    }

    tryLoad(0)
}

// ==========================================
// 9. CAMERA CONFIGURATION SYSTEM
// ==========================================

const cameraConfig = {
    // Position
    distance: 12,
    height: 6,
    lookAtY: 0,
    // Rotation removed (no roll)

    // Zoom
    fov: 60,
    
    // Smoothing
    damping: 0.1,

    // Collision
    collisionEnabled: true,
    collisionOffset: 2,

    // Orbit Controls
    minDistance: 2,
    maxDistance: 100,
    minPolarAngle: 0,
    maxPolarAngle: Math.PI,
    enablePan: true,
    enableRotate: true,
    enableZoom: true
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
// 10. LIGHTING CONFIGURATION SYSTEM
// ==========================================

const lightingConfig = {
    // Ambient Light
    ambientIntensity: 1.0,
    ambientColor: '#ffffff',

    // Directional Light
    dirIntensity: 2.0,
    dirColor: '#ffffff',
    dirPositionX: 50,
    dirPositionY: 100,
    dirPositionZ: 50,

    // Hemisphere Light
    hemisphereIntensity: 0.5,
    skyColor: '#87CEEB',
    groundColor: '#8B4513',

    // Spot Light
    spotIntensity: 1.0,
    spotColor: '#ffffff',
    spotDistance: 200,
    spotAngle: 30,
    spotPenumbra: 0.5,
    spotDecay: 2,

    // Point Light
    pointIntensity: 0.5,
    pointColor: '#ff6600',
    pointDistance: 50,

    // Shadows
    shadowEnabled: true,
    shadowMapSize: 2048,
    shadowBias: -0.0001,
    shadowRadius: 1,

    // Environment
    environmentIntensity: 1.0,
    environmentRotation: 0,

    // Theme
    theme: 'daylight'
}

function updateLighting() {
    // Ambient Light
    ambientLight.intensity = lightingConfig.ambientIntensity
    ambientLight.color.set(lightingConfig.ambientColor)

    // Directional Light
    dirLight.intensity = lightingConfig.dirIntensity
    dirLight.color.set(lightingConfig.dirColor)
    dirLight.position.set(
        lightingConfig.dirPositionX,
        lightingConfig.dirPositionY,
        lightingConfig.dirPositionZ
    )

    // Hemisphere Light
    hemisphereLight.intensity = lightingConfig.hemisphereIntensity
    hemisphereLight.color.set(lightingConfig.skyColor)
    hemisphereLight.groundColor.set(lightingConfig.groundColor)

    // Spot Light
    spotLight.intensity = lightingConfig.spotIntensity
    spotLight.color.set(lightingConfig.spotColor)
    spotLight.distance = lightingConfig.spotDistance
    spotLight.angle = THREE.MathUtils.degToRad(lightingConfig.spotAngle)
    spotLight.penumbra = lightingConfig.spotPenumbra
    spotLight.decay = lightingConfig.spotDecay

    // Point Light
    pointLight.intensity = lightingConfig.pointIntensity
    pointLight.color.set(lightingConfig.pointColor)
    pointLight.distance = lightingConfig.pointDistance

    // Shadows
    dirLight.castShadow = lightingConfig.shadowEnabled
    spotLight.castShadow = lightingConfig.shadowEnabled
    dirLight.shadow.mapSize.width = lightingConfig.shadowMapSize
    dirLight.shadow.mapSize.height = lightingConfig.shadowMapSize
    dirLight.shadow.bias = lightingConfig.shadowBias
    dirLight.shadow.radius = lightingConfig.shadowRadius

    // Update renderer
    renderer.shadowMap.enabled = lightingConfig.shadowEnabled
}
updateLighting()

// Lighting Themes
const lightingThemes = {
    daylight: () => {
        lightingConfig.ambientIntensity = 1.0
        lightingConfig.ambientColor = '#ffffff'
        lightingConfig.dirIntensity = 2.0
        lightingConfig.dirColor = '#ffffff'
        lightingConfig.skyColor = '#87CEEB'
        lightingConfig.groundColor = '#8B4513'
        scene.background = new THREE.Color(0x87CEEB)
        if (scene.fog) scene.fog = null
        updateLighting()
    },
    sunset: () => {
        lightingConfig.ambientIntensity = 0.8
        lightingConfig.ambientColor = '#ffcc99'
        lightingConfig.dirIntensity = 1.5
        lightingConfig.dirColor = '#ff6600'
        lightingConfig.skyColor = '#ff9966'
        lightingConfig.groundColor = '#663300'
        scene.background = new THREE.Color(0xff9966)
        if (scene.fog) scene.fog = null
        updateLighting()
    },
    night: () => {
        lightingConfig.ambientIntensity = 0.2
        lightingConfig.ambientColor = '#333366'
        lightingConfig.dirIntensity = 0.3
        lightingConfig.dirColor = '#4466aa'
        lightingConfig.skyColor = '#000033'
        lightingConfig.groundColor = '#001122'
        lightingConfig.pointIntensity = 1.0
        scene.background = new THREE.Color(0x000033)
        if (scene.fog) scene.fog = null
        updateLighting()
    },
    foggy: () => {
        lightingConfig.ambientIntensity = 0.6
        lightingConfig.ambientColor = '#cccccc'
        lightingConfig.dirIntensity = 0.8
        lightingConfig.dirColor = '#eeeeee'
        lightingConfig.skyColor = '#aaaaaa'
        lightingConfig.groundColor = '#666666'
        scene.fog = new THREE.Fog(0xaaaaaa, 10, 100)
        scene.background = new THREE.Color(0xaaaaaa)
        updateLighting()
    },
    clear: () => {
        scene.fog = null
        lightingThemes.daylight()
    }
}

// ==========================================
// 11. GUI CONTROL PANEL
// ==========================================

const gui = new GUI({ title: "🎬 DIRECTOR SETTINGS", width: 380 })

// Map Selector
const mapFolder = gui.addFolder('🗺️ Map Selector')
const mapControls = {
    selectedMap: 'Test Model (Debug)',
    loadMap: function() { loadMap(mapList[this.selectedMap]) }
}
mapFolder.add(mapControls, 'selectedMap', Object.keys(mapList)).onChange(() => mapControls.loadMap())
mapFolder.add(mapControls, 'loadMap').name('🔄 Load Map Sekarang')
mapFolder.open()

// Car Controls
const carFolder = gui.addFolder('🏎️ Car Control')
carFolder.add(carSettings, 'followCamera').name('🎥 Camera Follow')
carFolder.add(carSettings, 'autoDrive').name('🤖 Auto Pilot')
carFolder.add(carSettings, 'maxSpeed', 0.1, 3.0).name('🚀 Max Speed').step(0.1)
carFolder.add(carSettings, 'turnSpeed', 0.01, 0.1).name('🔄 Turn Speed').step(0.01)

// --- NEW FEATURE: COORDINATE CHECKER ---
carFolder.add({ getCoords: checkCoordinates }, 'getCoords').name('📍 Cek Koordinat (P)')
// ---------------------------------------

const scaleParams = { 
    size: 1, 
    autoScale: true,
    lastAutoScale: 1
}

carFolder.add(scaleParams, 'size', 0.1, 20).name('📏 Manual Scale').step(0.1).onChange((val) => {
    if (carModel && !scaleParams.autoScale) {
        carModel.scale.set(val, val, val)
    }
})

carFolder.add(scaleParams, 'autoScale').name('⚡ Auto Scale').onChange((val) => {
    if (val && currentMapModel) {
        autoScaleCarForMap()
        scaleParams.lastAutoScale = scaleParams.size
    } else if (!val && carModel) {
        carModel.scale.set(scaleParams.lastAutoScale, scaleParams.lastAutoScale, scaleParams.lastAutoScale)
    }
})

carFolder.add({
    resetCar: () => {
        if (carModel) {
            carModel.position.set(0, 2, 0)
            carModel.rotation.set(0, Math.PI, 0)
            carSpeed = 0
            steeringAngle = 0
            if (scaleParams.autoScale && currentMapModel) {
                setTimeout(() => autoScaleCarForMap(), 100)
            }
        }
    }
}, 'resetCar').name('🔄 Reset Car Position')

carFolder.open()

// Camera Settings
const camFolder = gui.addFolder('🎥 Camera Director')

// Follow Camera Settings
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

// Camera Presets
const camPresets = {
    default: () => {
        cameraConfig.distance = 12
        cameraConfig.height = 6
        cameraConfig.fov = 60
        cameraConfig.lookAtY = 0
        cameraConfig.damping = 0.1
    },
    topDown: () => {
        cameraConfig.distance = 1
        cameraConfig.height = 30
        cameraConfig.fov = 60
        cameraConfig.lookAtY = -10
    },
    racing: () => {
        cameraConfig.distance = 6
        cameraConfig.height = 2
        cameraConfig.fov = 80
        cameraConfig.lookAtY = 1
    },
    cinematic: () => {
        cameraConfig.distance = 20
        cameraConfig.height = 3
        cameraConfig.fov = 40
        cameraConfig.lookAtY = 0
        cameraConfig.damping = 0.2
    },
    driverView: () => {
        cameraConfig.distance = 3
        cameraConfig.height = 1.5
        cameraConfig.fov = 70
        cameraConfig.lookAtY = 1
        cameraConfig.damping = 0.05
    }
}

const presetFolder = camFolder.addFolder('📸 Camera Presets')
presetFolder.add(camPresets, 'default').name('🎯 Normal View')
presetFolder.add(camPresets, 'topDown').name('🛰️ Top Down')
presetFolder.add(camPresets, 'racing').name('🏁 Racing')
presetFolder.add(camPresets, 'cinematic').name('🎬 Cinematic')
presetFolder.add(camPresets, 'driverView').name('👨‍✈️ Driver View')

camFolder.open()

// Lighting Settings
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
    .name('Select Theme')
    .onChange((val) => lightingThemes[val]())

lightFolder.open()

// Performance Settings
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
// 12. INITIALIZATION & ANIMATION LOOP
// ==========================================

// Load car initially
loadCar()

// Auto-start with test model
setTimeout(() => {
    createTestModel()
    console.log("🎮 Kontrol:")
    console.log("• WASD - Gerakkan mobil")
    console.log("• P - Cek Koordinat (Cek Console/Alert)")
    console.log("• Mouse Drag - Rotate kamera")
    console.log("• Mouse Scroll - Zoom in/out")
    console.log("• GUI Panel - Semua pengaturan ada di kanan")
}, 100)

// Animation Loop
let lastTime = 0
const targetFPS = 60
const frameInterval = 1000 / targetFPS

function animate(currentTime) {
    requestAnimationFrame(animate)

    // Frame rate control
    const deltaTime = currentTime - lastTime
    if (deltaTime < frameInterval) return

    lastTime = currentTime - (deltaTime % frameInterval)

    // Update systems
    updateCar()

    // Update controls if not following camera
    if (!carSettings.followCamera) {
        controls.update()
    }

    // Update lighting animation
    if (lightingConfig.environmentRotation !== 0) {
        const time = clock.getElapsedTime()
        hemisphereLight.position.x = Math.sin(time * 0.1) * 100
        hemisphereLight.position.z = Math.cos(time * 0.1) * 100
    }

    // Render scene
    renderer.render(scene, camera)
}

// Window Resize Handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
})

// Start animation
animate(0)

// Hide loading screen after 3 seconds
setTimeout(() => {
    const loadingDiv = document.getElementById('loading')
    if (loadingDiv) loadingDiv.style.display = 'none'
    console.log("✅ Sistem siap digunakan!")
}, 3000)

// Error handling
window.addEventListener('error', (e) => {
    console.error('❌ Error:', e.error)
    const loadingDiv = document.getElementById('loading')
    if (loadingDiv) {
        loadingDiv.innerHTML = '<span style="color: #ff5555;">Error: ' + e.error.message + '</span>'
    }
})

// Export for debugging
window.scene = scene
window.camera = camera
window.carModel = () => carModel
window.currentMapModel = () => currentMapModel
console.log("🌐 Three.js Scene exported to window.scene for debugging")