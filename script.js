// Loop controls and Variables
let bedroomScene, bedroomCamera, bedroomRenderer, bedroomAnimId;
let doorMesh, doorMatOriginal;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// 1. SLEEP Button: Title Screen transition to Act 1 (Bedroom POV)
document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('title-screen').classList.add('hidden');
    
    const bedroomElem = document.getElementById('bedroom-scene');
    bedroomElem.classList.remove('hidden');

    requestAnimationFrame(() => {
        initBedroom3D();
    });
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

    // Scene, Fog and Ambient Setup
    bedroomScene = new THREE.Scene();
    const roomColor = 0x091409;
    bedroomScene.background = new THREE.Color(roomColor);
    bedroomScene.fog = new THREE.FogExp2(roomColor, 0.04);

    // Diagonal Camera POV (shifted to create a dynamic angle from bed to door)
    bedroomCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    bedroomCamera.position.set(-1.5, 1.4, 3.5);
    bedroomCamera.lookAt(0.5, 0.6, -3);

    bedroomRenderer = new THREE.WebGLRenderer({ antialias: false });
    bedroomRenderer.setSize(window.innerWidth, window.innerHeight);
    wrapper.appendChild(bedroomRenderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x445544, 1.6);
    bedroomScene.add(ambientLight);

    const doorLight = new THREE.PointLight(0x99bb99, 2.2, 14);
    doorLight.position.set(0, 2, -1);
    bedroomScene.add(doorLight);

    // 1. Floor
    const floorGeo = new THREE.PlaneGeometry(25, 25);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x122112, flatShading: true });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1, 0);
    bedroomScene.add(floor);

    // 2. Bedroom Door
    const doorGeo = new THREE.BoxGeometry(1.8, 3.4, 0.15);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2e442e, flatShading: true });
    doorMesh = new THREE.Mesh(doorGeo, doorMat);
    doorMesh.position.set(0, 0.7, -4);
    bedroomScene.add(doorMesh);
    
    // Handle on the left side
    const handleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.2);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x889988, flatShading: true });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(-0.6, 0.6, -3.9); // Positioned on the left
    bedroomScene.add(handle);

    // 3. Bed in left corner
    const bedGeo = new THREE.BoxGeometry(3.5, 0.9, 5);
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x192a19, flatShading: true });
    const bed = new THREE.Mesh(bedGeo, bedMat);
    bed.position.set(-3.2, -0.5, 1.5);
    bedroomScene.add(bed);

    // Mouse Move for Hover Effect
    window.addEventListener('mousemove', onCanvasMouseMove);

    // Door Click Handler
    window.addEventListener('click', onCanvasClick);

    function onCanvasMouseMove(event) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, bedroomCamera);
        const intersects = raycaster.intersectObject(doorMesh);

        // Hover feedback: brighter color when hovering the door
        if (intersects.length > 0) {
            doorMesh.material.color.setHex(0x456645);
            document.body.style.cursor = 'pointer';
        } else {
            doorMesh.material.color.setHex(0x2e442e);
            document.body.style.cursor = 'default';
        }
    }

    function onCanvasClick(event) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, bedroomCamera);
        const intersects = raycaster.intersectObject(doorMesh);

        // Clicked on the Door
        if (intersects.length > 0) {
            window.removeEventListener('click', onCanvasClick);
            window.removeEventListener('mousemove', onCanvasMouseMove);
            document.body.style.cursor = 'default';
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
        bedroomCamera.position.x = -1.5 + Math.sin(tempo) * 0.05;
        bedroomCamera.position.y = 1.4 + Math.cos(tempo * 0.4) * 0.03;

        bedroomRenderer.render(bedroomScene, bedroomCamera);
    }
    animate();
}