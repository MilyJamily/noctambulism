// AUDIO MANAGEMENT SYSTEM
let audioListener;
const sounds = {
    ambientDrone: null,
    step: null,
    doorOpen: null,
    terminalClick: null
};

// Function to initialize audio listener on the camera
function setupAudio(camera) {
    if (!audioListener) {
        audioListener = new THREE.AudioListener();
    }
    camera.add(audioListener);
}

const audioLoader = new THREE.AudioLoader();

// Load ambient background melody safely
function loadBackgroundMusic(camera) {
    setupAudio(camera);
    sounds.ambientDrone = new THREE.Audio(audioListener);

    audioLoader.load(
        'assets/sounds/weird_melody.mp3',
        function(buffer) {
            sounds.ambientDrone.setBuffer(buffer);
            sounds.ambientDrone.setLoop(true);
            sounds.ambientDrone.setVolume(0.3);
            sounds.ambientDrone.play();
        },
        undefined,
        function(error) {
            console.warn("Audio load warning (weird_melody): ", error);
        }
    );
}

// Function to trigger one-shot sound effects safely
function playSFX(filePath, volume = 0.5) {
    if (!audioListener) return;

    const sound = new THREE.Audio(audioListener);
    audioLoader.load(
        filePath,
        function(buffer) {
            sound.setBuffer(buffer);
            sound.setLoop(false);
            sound.setVolume(volume);
            sound.play();
        },
        undefined,
        function(error) {
            console.warn("SFX load warning: ", error);
        }
    );
}

// LOOP CONTROLS AND GLOBAL VARIABLES
let bedroomScene, bedroomCamera, bedroomRenderer, bedroomAnimId;
let doorMesh;
let isTransitioning = false;
let transitionProgress = 0;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Cell Modal & Dialogue State
let cellScene, cellCamera, cellRenderer, cellAnimId;
let isModalOpen = false;

const cellDialogues = [
    "[ ... ]",
    "[ Not here kid. ]",
    "[ Keep... ]",
    "[ YOU SHOULDN'T HAVE LOOKED UP. ]"
];

// 1. TITLE SCREEN & SLEEP BUTTON EVENT
document.getElementById('start-btn').addEventListener('click', () => {
    // Resume audio context safely to comply with browser policies
    const audioCtx = THREE.AudioContext.getContext();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    // Play retro click sound effect
    playSFX('assets/sounds/computer_glitch.mp3', 0.6);

    const fadeOverlay = document.getElementById('fade-overlay');
    fadeOverlay.classList.add('active');

    setTimeout(() => {
        document.getElementById('title-screen').classList.add('hidden');
        const bedroomElem = document.getElementById('bedroom-scene');
        bedroomElem.classList.remove('hidden');

        requestAnimationFrame(() => {
            initBedroom3D();
            // Start background weird melody once bedroom camera is ready
            loadBackgroundMusic(bedroomCamera);
        });

        setTimeout(() => {
            fadeOverlay.classList.remove('active');
        }, 300);
    }, 600);
});

// ESC to return to Title Screen
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (isModalOpen) closeCellModal();

        if (bedroomAnimId) cancelAnimationFrame(bedroomAnimId);
        if (typeof arcadeAnimId !== 'undefined' && arcadeAnimId) cancelAnimationFrame(arcadeAnimId);

        document.getElementById('arcade-scene').classList.add('hidden');
        document.getElementById('bedroom-scene').classList.add('hidden');
        document.getElementById('title-screen').classList.remove('hidden');
        document.getElementById('fade-overlay').classList.remove('active');
        isTransitioning = false;
    }

    if ((e.key === ' ' || e.key.toLowerCase() === 'e') && isModalOpen) {
        closeCellModal();
    }
});

// ACT 1: POV BEDROOM
function initBedroom3D() {
    isTransitioning = false;
    transitionProgress = 0;

    const container = document.getElementById('bedroom-scene');
    container.innerHTML = '<div class="arcade-wrapper" id="bedroom-canvas"></div>';
    const wrapper = document.getElementById('bedroom-canvas');

    bedroomScene = new THREE.Scene();
    const roomColor = 0x091409;
    bedroomScene.background = new THREE.Color(roomColor);
    bedroomScene.fog = new THREE.FogExp2(roomColor, 0.04);

    bedroomCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    bedroomCamera.position.set(-1.5, 1.4, 3.5);
    bedroomCamera.lookAt(0.5, 0.6, -3);

    bedroomRenderer = new THREE.WebGLRenderer({ antialias: false });
    bedroomRenderer.setSize(window.innerWidth, window.innerHeight);
    wrapper.appendChild(bedroomRenderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x445544, 1.6);
    bedroomScene.add(ambientLight);

    const doorLight = new THREE.PointLight(0x99bb99, 2.2, 14);
    doorLight.position.set(0, 2, -1);
    bedroomScene.add(doorLight);

    const floorGeo = new THREE.PlaneGeometry(25, 25);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x122112, flatShading: true });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1, 0);
    bedroomScene.add(floor);

    const doorGeo = new THREE.BoxGeometry(1.8, 3.4, 0.15);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2e442e, flatShading: true });
    doorMesh = new THREE.Mesh(doorGeo, doorMat);
    doorMesh.position.set(0, 0.7, -4);
    bedroomScene.add(doorMesh);
    
    const handleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.2);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x889988, flatShading: true });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(-0.6, 0.6, -3.9);
    bedroomScene.add(handle);

    const bedGeo = new THREE.BoxGeometry(3.5, 0.9, 5);
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x192a19, flatShading: true });
    const bed = new THREE.Mesh(bedGeo, bedMat);
    bed.position.set(-3.2, -0.5, 1.5);
    bedroomScene.add(bed);

    window.addEventListener('mousemove', onCanvasMouseMove);
    window.addEventListener('click', onCanvasClick);

    function onCanvasMouseMove(event) {
        if (isTransitioning) return;

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, bedroomCamera);
        const intersects = raycaster.intersectObject(doorMesh);

        if (intersects.length > 0) {
            doorMesh.material.color.setHex(0x456645);
            document.body.style.cursor = 'pointer';
        } else {
            doorMesh.material.color.setHex(0x2e442e);
            document.body.style.cursor = 'default';
        }
    }

    function onCanvasClick(event) {
        if (isTransitioning) return;

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, bedroomCamera);
        const intersects = raycaster.intersectObject(doorMesh);

        if (intersects.length > 0) {
            isTransitioning = true;
            document.body.style.cursor = 'default';
            window.removeEventListener('click', onCanvasClick);
            window.removeEventListener('mousemove', onCanvasMouseMove);

            const fadeOverlay = document.getElementById('fade-overlay');
            fadeOverlay.classList.add('active');

            setTimeout(() => {
                if (bedroomAnimId) cancelAnimationFrame(bedroomAnimId);
                document.getElementById('bedroom-scene').classList.add('hidden');
                document.getElementById('arcade-scene').classList.remove('hidden');
                
                setTimeout(() => {
                    fadeOverlay.classList.remove('active');
                }, 400);

                console.log("Entering Act 2: Corridor...");
                initArcade3D();
            }, 2200);
        }
    }

    function animate() {
        bedroomAnimId = requestAnimationFrame(animate);

        const tempo = Date.now() * 0.0002;

        if (isTransitioning) {
            transitionProgress += 0.008;
            bedroomCamera.position.z -= 0.025;
            bedroomCamera.position.x += (0 - bedroomCamera.position.x) * 0.03;
            bedroomCamera.position.y += (0.7 - bedroomCamera.position.y) * 0.03;
            bedroomCamera.rotation.z += 0.0035; 
        } else {
            bedroomCamera.position.x = -1.5 + Math.sin(tempo) * 0.05;
            bedroomCamera.position.y = 1.4 + Math.cos(tempo * 0.4) * 0.03;
        }

        bedroomRenderer.render(bedroomScene, bedroomCamera);
    }
    animate();
}

// ACT 2: THE DREAM / HALLWAY
let arcadeScene, arcadeCamera, arcadeRenderer, arcadeAnimId;
let playerMesh, ghostPlayers = [];
let corridorDoors = [];
let activeDoorIndex = 0;
const keysPressed = {};

function initArcade3D() {
    const container = document.getElementById('arcade-scene');
    container.innerHTML = '<div class="arcade-wrapper" id="arcade-canvas"></div>';
    const wrapper = document.getElementById('arcade-canvas');

    arcadeScene = new THREE.Scene();
    const corridorColor = 0x050a05;
    arcadeScene.background = new THREE.Color(corridorColor);
    arcadeScene.fog = new THREE.FogExp2(corridorColor, 0.035);

    arcadeCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

    arcadeRenderer = new THREE.WebGLRenderer({ antialias: false });
    arcadeRenderer.setSize(window.innerWidth, window.innerHeight);
    wrapper.appendChild(arcadeRenderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x333b2b, 1.3);
    arcadeScene.add(ambientLight);

    for (let z = -10; z > -60; z -= 15) {
        const yellowishLight = new THREE.PointLight(0xffaa44, 1.8, 10);
        yellowishLight.position.set(0, 2.5, z);
        arcadeScene.add(yellowishLight);
    }

    const floorGeo = new THREE.PlaneGeometry(6, 120);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0c170c, flatShading: true });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1, -50);
    arcadeScene.add(floor);

    const ceilMesh = new THREE.Mesh(floorGeo, floorMat);
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.set(0, 3, -50);
    arcadeScene.add(ceilMesh);

    const wallGeo = new THREE.BoxGeometry(0.5, 4, 120);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x162416, flatShading: true });
    
    const leftWall = new THREE.Mesh(wallGeo, wallMat);
    leftWall.position.set(-3.2, 1, -50);
    arcadeScene.add(leftWall);

    const rightWall = new THREE.Mesh(wallGeo, wallMat);
    rightWall.position.set(3.2, 1, -50);
    arcadeScene.add(rightWall);

    const pillarGeo = new THREE.BoxGeometry(0.4, 4, 0.8);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1f2e1f, flatShading: true });
    for (let z = -5; z > -55; z -= 10) {
        const pLeft = new THREE.Mesh(pillarGeo, pillarMat);
        pLeft.position.set(-3.0, 1, z);
        arcadeScene.add(pLeft);

        const pRight = new THREE.Mesh(pillarGeo, pillarMat);
        pRight.position.set(3.0, 1, z);
        arcadeScene.add(pRight);
    }

    const playerGeo = new THREE.BoxGeometry(0.8, 1.8, 0.5);
    const playerMat = new THREE.MeshStandardMaterial({ color: 0x3a523a, flatShading: true });
    playerMesh = new THREE.Mesh(playerGeo, playerMat);
    playerMesh.position.set(0, 0, 0);
    arcadeScene.add(playerMesh);

    ghostPlayers = [];
    for (let i = 1; i <= 3; i++) {
        const ghostMat = new THREE.MeshStandardMaterial({ color: 0x223322, transparent: true, opacity: 0.6, flatShading: true });
        const ghost = new THREE.Mesh(playerGeo, ghostMat);
        ghost.position.set(0, 0, i * 2.5);
        arcadeScene.add(ghost);
        ghostPlayers.push(ghost);
    }

    corridorDoors = [];
    const doorGeo = new THREE.BoxGeometry(1.6, 3, 0.2);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x243624, flatShading: true });

    for (let i = 0; i < 4; i++) {
        const door = new THREE.Mesh(doorGeo, doorMat.clone());
        const xPos = (i % 2 === 0) ? -2.9 : 2.9;
        const zPos = -12 - (i * 14);
        
        door.position.set(xPos, 0.5, zPos);
        if (i % 2 === 0) door.rotation.y = Math.PI / 2;
        else door.rotation.y = -Math.PI / 2;

        door.userData = { id: i, opened: false };
        arcadeScene.add(door);
        corridorDoors.push(door);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    function onKeyDown(e) {
        if (isModalOpen) return;

        const key = e.key.toLowerCase();
        if (key === 'w' || key === 'a' || key === 'd') {
            keysPressed[key] = true;
        }
        if (key === 'e') {
            tryInteractDoor();
        }
    }

    function onKeyUp(e) {
        const key = e.key.toLowerCase();
        if (keysPressed[key]) {
            keysPressed[key] = false;
        }
    }

    function tryInteractDoor() {
        const currentDoor = corridorDoors[activeDoorIndex];
        if (!currentDoor) return;

        const distance = playerMesh.position.distanceTo(currentDoor.position);

        if (distance < 4.5 && !currentDoor.userData.opened) {
            currentDoor.userData.opened = true;
            currentDoor.material.color.setHex(0x557755);

            if (ghostPlayers.length > 0) {
                const fadingGhost = ghostPlayers.pop();
                arcadeScene.remove(fadingGhost);
            }

            // Check if this is the 3rd door (index 2)., triggering the real-world glitch sequence
            if (activeDoorIndex === 2) {
                triggerRealWorldGlitch();
            } else if (activeDoorIndex === 3) {
                // Final door opens directly in full screen
                triggerFinalClimaxScene();
            } else {
                openCellModal(activeDoorIndex);
            }

            activeDoorIndex++;
        }
    }

    let walkCycle = 0;

    function animateArcade() {
        arcadeAnimId = requestAnimationFrame(animateArcade);

        if (isModalOpen) {
            arcadeRenderer.render(arcadeScene, arcadeCamera);
            return;
        }

        const moveSpeed = 0.038; 
        let isMoving = false;

        if (keysPressed['w']) {
            playerMesh.position.z -= moveSpeed;
            isMoving = true;
        }
        if (keysPressed['a'] && playerMesh.position.x > -2.5) {
            playerMesh.position.x -= moveSpeed * 0.8;
            isMoving = true;
        }
        if (keysPressed['d'] && playerMesh.position.x < 2.5) {
            playerMesh.position.x += moveSpeed * 0.8;
            isMoving = true;
        }

        const currentDoor = corridorDoors[activeDoorIndex];
        const promptElem = document.getElementById('interaction-prompt');
        
        if (currentDoor && !currentDoor.userData.opened) {
            const distance = playerMesh.position.distanceTo(currentDoor.position);
            if (distance < 4.5) {
                promptElem.classList.remove('hidden');
            } else {
                promptElem.classList.add('hidden');
            }
        } else {
            promptElem.classList.add('hidden');
        }

        if (isMoving) {
            walkCycle += 0.08;
        } else {
            walkCycle += 0.02;
        }

        const bobOffset = Math.sin(walkCycle) * (isMoving ? 0.08 : 0.03);
        const swayOffset = Math.cos(walkCycle * 0.5) * (isMoving ? 0.05 : 0.01);

        arcadeCamera.position.x = playerMesh.position.x + swayOffset;
        arcadeCamera.position.y = playerMesh.position.y + 1.8 + bobOffset;
        arcadeCamera.position.z = playerMesh.position.z + 4.5;
        
        arcadeCamera.lookAt(
            playerMesh.position.x - swayOffset * 0.5, 
            playerMesh.position.y + 0.5 + bobOffset * 0.5, 
            playerMesh.position.z - 3
        );

        ghostPlayers.forEach((ghost, index) => {
            const targetZ = playerMesh.position.z + ((index + 1) * 2.8);
            ghost.position.z += (targetZ - ghost.position.z) * 0.05;
            ghost.position.x += (playerMesh.position.x - ghost.position.x) * 0.03;
            ghost.position.y = Math.sin(Date.now() * 0.002 + index) * 0.06;
        });

        arcadeRenderer.render(arcadeScene, arcadeCamera);
    }
    animateArcade();
}

// CELL INSPECTION MODAL (POP-UP SYSTEM)
function openCellModal(doorIndex) {
    isModalOpen = true;
    document.getElementById('interaction-prompt').classList.add('hidden');
    const modalElem = document.getElementById('cell-modal');
    modalElem.classList.remove('hidden');

    const textElem = document.getElementById('cell-text');
    textElem.innerText = cellDialogues[doorIndex] || "[ ... ]";

    const container = document.getElementById('cell-canvas-container');
    container.innerHTML = '';

    cellScene = new THREE.Scene();
    cellScene.background = new THREE.Color(0x040804);

    cellCamera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
    cellCamera.position.set(0, 1.2, 3);
    cellCamera.lookAt(0, 0.8, 0);

    cellRenderer = new THREE.WebGLRenderer({ antialias: false });
    cellRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(cellRenderer.domElement);

    const cellLight = new THREE.PointLight(doorIndex === 3 ? 0x995544 : 0x77aa77, 2, 10);
    cellLight.position.set(0, 2.5, 1);
    cellScene.add(cellLight);

    const ambientLight = new THREE.AmbientLight(0x223322, 1.2);
    cellScene.add(ambientLight);

    const bunkMat = new THREE.MeshStandardMaterial({ color: 0x1f2e1f, flatShading: true });
    const bunkGeo = new THREE.BoxGeometry(1.2, 1.8, 2.2);
    const bunk = new THREE.Mesh(bunkGeo, bunkMat);
    bunk.position.set(-1.2, 0.5, -0.5);
    cellScene.add(bunk);

    const winGeo = new THREE.BoxGeometry(0.8, 0.6, 0.1);
    const winMat = new THREE.MeshStandardMaterial({ color: 0x334433, flatShading: true });
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(0, 1.8, -1.9);
    cellScene.add(win);

    const boneMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, flatShading: true });

    if (doorIndex === 0) {
        const skullGeo = new THREE.SphereGeometry(0.2, 6, 6);
        const skull = new THREE.Mesh(skullGeo, boneMat);
        skull.position.set(0.4, -0.3, 0);
        cellScene.add(skull);
    } else if (doorIndex === 1) {
        const ribGeo = new THREE.BoxGeometry(0.4, 0.3, 0.4);
        const rib = new THREE.Mesh(ribGeo, boneMat);
        rib.position.set(0.2, -0.3, -0.2);
        cellScene.add(rib);
    } else if (doorIndex === 2) {
        const boneGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 5);
        const bone = new THREE.Mesh(boneGeo, boneMat);
        bone.rotation.z = 0.5;
        bone.position.set(-0.2, -0.2, 0.3);
        cellScene.add(bone);
    } else if (doorIndex === 3) {
        const tankGeo = new THREE.CylinderGeometry(0.8, 0.8, 2, 8);
        const tankMat = new THREE.MeshStandardMaterial({ color: 0x224433, transparent: true, opacity: 0.7, flatShading: true });
        const tank = new THREE.Mesh(tankGeo, tankMat);
        tank.position.set(0, 0.6, -0.5);
        cellScene.add(tank);

        const skelGeo = new THREE.BoxGeometry(0.4, 1.2, 0.3);
        const skel = new THREE.Mesh(skelGeo, boneMat);
        skel.position.set(0, 0.6, -0.5);
        cellScene.add(skel);

        cellScene.background = new THREE.Color(0x1a0505);
        for (let i = 0; i < 12; i++) {
            const eyeGeo = new THREE.SphereGeometry(0.12, 6, 6);
            const eyeMat = new THREE.MeshBasicMaterial({ color: (i % 2 === 0) ? 0xffffff : 0xff2222 });
            const eye = new THREE.Mesh(eyeGeo, eyeMat);
            eye.position.set(
                (Math.random() - 0.5) * 4,
                1.5 + Math.random() * 1.5,
                -1.8 + (Math.random() - 0.5)
            );
            cellScene.add(eye);
        }
    }

    function animateCell() {
        if (!isModalOpen) return;
        cellAnimId = requestAnimationFrame(animateCell);
        
        const t = Date.now() * 0.001;
        cellCamera.position.y = 1.2 + Math.sin(t) * 0.02;

        cellRenderer.render(cellScene, cellCamera);
    }
    animateCell();
}

function closeCellModal() {
    isModalOpen = false;
    if (cellAnimId) cancelAnimationFrame(cellAnimId);
    document.getElementById('cell-modal').classList.add('hidden');
}

// Trigger the real-world glitch flash and camera fall recovery
function triggerRealWorldGlitch() {
    isModalOpen = true;
    document.getElementById('interaction-prompt').classList.add('hidden');

    const glitchOverlay = document.getElementById('real-glitch-overlay');
    glitchOverlay.classList.add('active');

    // Play intense glitch sound
    playSFX('assets/sounds/passingby_glitch.mp3', 0.8);

    setTimeout(() => {
        glitchOverlay.classList.remove('active');

        // Simulate camera falling down and recovering
        let dropProgress = 0;
        const dropInterval = setInterval(() => {
            dropProgress += 0.02;
            arcadeCamera.position.y = Math.max(0.4, 1.8 - Math.sin(dropProgress * Math.PI) * 1.2);

            if (dropProgress >= 1) {
                clearInterval(dropInterval);

                // Automatically progress to Door 4 after recovering vision
                setTimeout(() => {
                    isModalOpen = false;
                    triggerFinalClimaxScene();
                }, 800);
            }
        }, 30);
    }, 300);
}

// Trigger the grand finale full-screen scene for Door 4
function triggerFinalClimaxScene() {
    isModalOpen = true;
    document.getElementById('interaction-prompt').classList.add('hidden');

    const fadeOverlay = document.getElementById('fade-overlay');
    fadeOverlay.classList.add('active');

    setTimeout(() => {
        // Clear arcade scene and transform the environment into the final surreal pool room
        document.getElementById('arcade-scene').classList.add('hidden');

        const container = document.getElementById('arcade-scene');
        container.classList.remove('hidden');
        container.innerHTML = '<div class="arcade-wrapper" id="final-canvas-container"></div>';

        const finalWrapper = document.getElementById('final-canvas-container');

        const finalScene = new THREE.Scene();
        finalScene.background = new THREE.Color(0x020508);

        const finalCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        finalCamera.position.set(0, 1.5, 3);
        finalCamera.lookAt(0, 1, -2);

        const finalRenderer = new THREE.WebGLRenderer({ antilias: false });
        finalRenderer.setSize(window.innerWidth, window.innerHeight);
        finalWrapper.appendChild(finalRenderer.domElement);

        // Surreal lighting and radiant blue water tank
        const waterLight = new THREE.PointLight(0x00aaff, 3, 15);
        waterLight.position.set(0, 2, -2);
        finalScene.add(waterLight);

        const ambientLight = new THREE.AmbientLight(0x112233, 1.5);
        finalScene.add(ambientLight);

        // Radiant blue pool
        const tankGeo = new THREE.CylinderGeometry(2, 2, 2.5, 12);
        const tankMat = new THREE.MeshStandardMaterial({ color: 0x0088ff, transparent: true, opacity: 0.6, flatShading: true });
        const tank = new THREE.Mesh(tankGeo, tankMat);
        tank.position.set(0, 0.2, -6);
        finalScene.add(tank);

        // Skeleton inside the tank
        const boneMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, flatShading: true });
        const skelGeo = new THREE.BoxGeometry(0.6, 1.5, 0.4);
        const skeleton = new THREE.Mesh(skelGeo, boneMat);
        skeleton.position.set(0, 0.5, -6);
        finalScene.add(skeleton);

        // Surreal sky of eyes
        for (let i = 0; i < 25; i++) {
            const eyeGeo = new THREE.SphereGeometry(0.15, 6, 6);
            const eyeMat = new THREE.MeshBasicMaterial({ color: (i % 3 === 0) ? 0xff0000 : 0xffffff });
            const eye = new THREE.Mesh(eyeGeo, eyeMat);
            eye.position.set(
                (Math.random() - 0.5) * 12,
                3 + Math.random() * 4,
                -4 - Math.random() * 8
            );
            finalScene.add(eye);
        }

        setTimeout(() => {
            fadeOverlay.classList.remove('active');
        }, 500);

        function animateFinal() {
            requestAnimationFrame(animateFinal);
            finalCamera.position.z -= 0.005; // Slow eerie forward creep into the final abyss
            finalRenderer.render(finalScene, finalCamera);
        }
        animateFinal();

    }, 1000);
}