// Loop controls and Variables
let bedroomScene, bedroomCamera, bedroomRenderer, bedroomAnimId;
let doorMesh;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// 1. SLEEP Button: Title Screen transition to Act 1 (Bedroom POV)
document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('bedroom-scene').classList.remove('hidden');
    initBedroom3D();
});

// 2. ESC to return to Title Screen
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (bedroomAnimId) cancelAnimationFrame(bedroomAnimId);
        if (typeof animationId !== 'undefined' && animationId) cancelAnimationFrame(animationId);

        document.getElementById('arcade-scene').classList.add('hidden');
        document.getElementById('bedroom-scene').classList.add('hidden');
        document.getElementById('title-screen').classList.remove('hidden');
    }
});

// Act 1: POV Bedroom
function initBedroom3D() {
    const container = document.getElementById('bedroom-scene');
    container.innerHTML = '<div class="arcade-wrapper" id="bedroom-canvas"></div>';
    const wrapper = document.getElementById('bedroom-canvas');

    // Scene, Fog and Vignette
    bedroomScene = new THREE.Scene();
    const roomColor = 0x040804;
    bedroomScene.background = new THREE.Color(roomColor);
    bedroomScene.fog = new THREE.FogExp2(roomColor, 0.05);

    // Camera POV
    bedroomCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    bedroomCamera.position.set(0, 1.2, 4);
    bedroomCamera.lookAt(0, 0.5, -3);

    bedroomRenderer = new THREE.WebGLRenderer({ antialias: false });
    bedroomRenderer.setSize(window.innerWidth, window.innerHeight);
    wrapper.appendChild(bedroomRenderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x223322, 1.2);
    bedroomScene.add(ambientLight);

    const doorLight = new THREE.PointLight(0x779977, 1.8, 12);
    doorLight.position.set(0, 2, -1);
    bedroomScene.add(doorLight);

    // 1. Floor
    const floorGeo = new THREE.PlaneGeometry(20, 20);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x081008, flatShading: true });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1, 0);
    bedroomScene.add(floor);

    // 2. Bedroom Door
    const doorGeo = new THREE.BoxGeometry(1.8, 3.4, 0.15);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x1f2e1f, flatShading: true });
    doorMesh = new THREE.Mesh(doorGeo, doorMat);
    doorMesh.position.set(0, 0.7, -4);
    bedroomScene.add(doorMesh);
    
    // Handle and door Crack
    const handleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.2);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x556655, flatShading: true });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(0.6, 0.6, -3.9);
    bedroomScene.add(handle);

    // 3. Bed in left corner
    const bedGeo = new THREE.BoxGeometry(3.5, 0.9, 5);
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x0d170d, flatShading: true });
    const bed = new THREE.Mesh(bedGeo, bedMat);
    bed.position.set(-3.2, -0.5, 1.5);
    bedroomScene.add(bed);

    // Door Click
    window.addEventListener('click', onCanvasClick);

    function onCanvasClick(event) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, bedroomCamera);
        const intersects = raycaster.intersectObject(doorMesh);

        // Clicked on the Door or nearby
        if (intersects.length > 0) {
            window.removeEventListener('click', onCanvasClick);
            if (bedroomAnimId) cancelAnimationFrame(bedroomAnimId);

            console.log("Door clicked! Going to Act 2...");
            document.getElementById('bedroom-scene').classList.add('hidden');
            document.getElementById('arcade-scene').classList.remove('hidden');

            // Hallway & Dream (Next step)
        }
    }

    // Animation Loop
    function animate() {
        bedroomAnimId = requestAnimationFrame(animate);

        const tempo = Date.now() * 0.0002;
        bedroomCamera.position.x = Math.sin(tempo) * 0.05;
        bedroomCamera.position.y = 1.2 + Math.cos(tempo * 0.4) * 0.03;

        bedroomRenderer.render(bedroomScene, bedroomCamera);
    }
    animate();
}