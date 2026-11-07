import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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
    const audioCtx = THREE.AudioContext.getContext();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    playSFX('assets/sounds/computer_glitch.mp3', 0.6);

    const fadeOverlay = document.getElementById('fade-overlay');
    fadeOverlay.classList.add('active');

    setTimeout(() => {
        document.getElementById('title-screen').classList.add('hidden');
        const bedroomElem = document.getElementById('bedroom-scene');
        bedroomElem.classList.remove('hidden');

        requestAnimationFrame(() => {
            initBedroom3D();
            loadBackgroundMusic(bedroomCamera);
        });

        setTimeout(() => {
            fadeOverlay.classList.remove('active');
        }, 300);
    }, 600);
});

// ESC to return to Title Screen
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (e.key === 'Escape') {
        if (isModalOpen) closeCellModal();

        if (bedroomAnimId) cancelAnimationFrame(bedroomAnimId);
        if (typeof arcadeAnimId !== 'undefined' && arcadeAnimId) cancelAnimationFrame(arcadeAnimId);

        document.getElementById('arcade-scene').classList.add('hidden');
        document.getElementById('bedroom-scene').classList.add('hidden');
        document.getElementById('title-screen').classList.remove('hidden');
        document.getElementById('fade-overlay').classList.remove('active');
        isTransitioning = false;
        return;
    }

    // Handle Space bar to exit modal or enter unlocked cell
    if (e.key === ' ' && isModalOpen) {
        if (activeDoorIndex === 0 && cell1Unlocked) {
            enterUnlockedCell();
        } else {
            closeCellModal();
        }
        return;
    }

    // Handle Padlock unlock with 'E' key on Cell 0
    if (isModalOpen && activeDoorIndex === 0 && hasKey && !cell1Unlocked && key === 'e') {
        cell1Unlocked = true;
        playSFX('assets/sounds/door_open.mp3', 0.8);
        openCellModal(0); // Refresh modal view to show green padlock and space prompt
        return;
    }

    // Handle Chest and Key pickup interaction in hallway
    if (!isModalOpen && arcadeScene && playerMesh && chestMesh && key === 'e') {
        const distanceToChest = playerMesh.position.distanceTo(chestMesh.position);
        if (distanceToChest < 4.0) {
            if (!chestOpened) {
                chestOpened = true;
                playSFX('assets/sounds/terminal_click.mp3', 0.6);
                chestMesh.material.color.setHex(0x2a1f17);

                const keyGeo = new THREE.BoxGeometry(0.2, 0.5, 0.1);
                const keyMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
                keyMesh = new THREE.Mesh(keyGeo, keyMat);
                keyMesh.position.set(0, 0.2, 12);
                arcadeScene.add(keyMesh);

                keyLight = new THREE.PointLight(0xffd700, 2, 5);
                keyLight.position.set(0, 0.2, 12);
                arcadeScene.add(keyLight);
            } else if (chestOpened && !keyCollected) {
                keyCollected = true;
                hasKey = true;
                arcadeScene.remove(keyMesh);
                arcadeScene.remove(keyLight);
                document.getElementById('interaction-prompt').classList.add('hidden');
                console.log("Key collected successfully!");
            }
        }
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

    const backWallGeo = new THREE.PlaneGeometry(25, 25);
    const backWallMat = new THREE.MeshStandardMaterial({ color: 0x060f06, flatShading: true });
    const backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, 6.5, -4.1);
    bedroomScene.add(backWall);

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

    const bedGeo = new THREE.BoxGeometry(3.2, 0.7, 4.5);
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x192a19, flatShading: true });
    const bed = new THREE.Mesh(bedGeo, bedMat);
    bed.position.set(-2.5, -0.65, 0.5);
    bedroomScene.add(bed);

    const blanketGeo = new THREE.BoxGeometry(3.1, 0.08, 4.3);
    const blanketMat = new THREE.MeshStandardMaterial({ color: 0x0b1329, flatShading: true });
    const blanket = new THREE.Mesh(blanketGeo, blanketMat);
    blanket.position.set(-2.5, -0.28, 0.5);
    bedroomScene.add(blanket);

    const starMat = new THREE.MeshBasicMaterial({ color: 0x88bbff });
    const starPositions = [
        [-3.0, -0.22, -0.5],
        [-2.0, -0.22, 0.2],
        [-2.7, -0.22, 1.2],
        [-1.8, -0.22, -0.8],
    ];

    starPositions.forEach(pos => {
        const starGeo = new THREE.BoxGeometry(0.15, 0.02, 0.15);
        const star = new THREE.Mesh(starGeo, starMat);
        star.position.set(pos[0], pos[1], pos[2]);
        bedroomScene.add(star);
    });

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
let playerMesh;
let skeletonModelRef = null;
let ghostPlayers = [];
let corridorDoors = [];
let activeDoorIndex = 0;
const keysPressed = {};

// Key, Progress and Cell Variables
let chestMesh;
let keyMesh;
let keyLight;
let chestOpened = false;
let keyCollected = false;
let hasKey = false;
let cell1Unlocked = false;

const MODEL_FORWARD_OFFSET = -Math.PI / 2;

let skeletonMixer = null;
let walkAction = null;
let idleAction = null;
const clock = new THREE.Clock();

function initArcade3D() {
    Object.keys(keysPressed).forEach(key => {
        keysPressed[key] = false;
    });
    skeletonModelRef = null;
    skeletonMixer = null;
    walkAction = null;
    idleAction = null;
    chestOpened = false;
    keyCollected = false;
    hasKey = false;
    cell1Unlocked = false;
    activeDoorIndex = 0;

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

    const chestGeo = new THREE.BoxGeometry(1.2, 0.8, 0.8);
    const chestMat = new THREE.MeshStandardMaterial({ color: 0x4a3525, flatShading: true });
    chestMesh = new THREE.Mesh(chestGeo, chestMat);
    chestMesh.position.set(0, -0.6, 12);
    arcadeScene.add(chestMesh);

    playerMesh = new THREE.Group();
    playerMesh.position.set(0, 0, 0);
    arcadeScene.add(playerMesh);

    const fallbackGeo = new THREE.BoxGeometry(0.8, 1.8, 0.5);
    const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x3a523a, flatShading: true });
    const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
    fallbackMesh.name = 'fallback-placeholder';
    playerMesh.add(fallbackMesh);

    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
        'assets/models/skeleton_IdleWalk.glb',
        function (gltf) {
            const skeletonModel = gltf.scene;
            skeletonModelRef = skeletonModel;

            skeletonModel.scale.set(1.5, 1.5, 1.5);
            skeletonModel.position.set(0, -1.0, 0);
            skeletonModel.rotation.y = MODEL_FORWARD_OFFSET;

            const oldPlaceholder = playerMesh.getObjectByName('fallback-placeholder');
            if (oldPlaceholder) {
                playerMesh.remove(oldPlaceholder);
            }

            playerMesh.add(skeletonModel);

            if (gltf.animations && gltf.animations.length > 0) {
                skeletonMixer = new THREE.AnimationMixer(skeletonModel);
                idleAction = skeletonMixer.clipAction(gltf.animations[0]);
                walkAction = gltf.animations.length > 1 ? skeletonMixer.clipAction(gltf.animations[1]) : idleAction;

                idleAction.play();
                walkAction.play();
                idleAction.setEffectiveWeight(1);
                walkAction.setEffectiveWeight(0);
            }
        },
        undefined,
        function (error) {
            console.warn('Warning: Could not load skeleton GLB model.', error);
        }
    );

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
        if (key === 'w' || key === 's' || key === 'a' || key === 'd') {
            e.preventDefault();
            keysPressed[key] = true;
        }
        if (key === 'e') {
            tryInteractDoor();
        }
    }

    function onKeyUp(e) {
        const key = e.key.toLowerCase();
        if (key === 'w' || key === 's' || key === 'a' || key === 'd') {
            e.preventDefault();
            keysPressed[key] = false;
        }
    }

    function tryInteractDoor() {
        const currentDoor = corridorDoors[activeDoorIndex];
        if (!currentDoor) return;

        const distance = playerMesh.position.distanceTo(currentDoor.position);

        if (distance < 4.5) {
            if (activeDoorIndex === 0 && !cell1Unlocked) {
                openCellModal(0);
                return;
            }

            if (!currentDoor.userData.opened) {
                currentDoor.userData.opened = true;
                currentDoor.material.color.setHex(0x557755);
            }

            if (activeDoorIndex === 2) {
                triggerRealWorldGlitch();
            } else if (activeDoorIndex === 3) {
                triggerFinalClimaxScene();
            } else {
                openCellModal(activeDoorIndex);
            }
        }
    }

    let walkCycle = 0;

    function animateArcade() {
        arcadeAnimId = requestAnimationFrame(animateArcade);

        const delta = clock.getDelta();
        if (skeletonMixer) {
            skeletonMixer.update(delta);
        }

        if (isModalOpen) {
            arcadeRenderer.render(arcadeScene, arcadeCamera);
            return;
        }

        const moveSpeed = 0.038; 
        let isMoving = false;
        let inputX = 0;
        let inputZ = 0;

        if (keysPressed['w']) { inputZ -= 1; isMoving = true; }
        if (keysPressed['s']) { inputZ += 1; isMoving = true; }
        if (keysPressed['a']) { inputX -= 1; isMoving = true; }
        if (keysPressed['d']) { inputX += 1; isMoving = true; }

        if (isMoving) {
            const length = Math.sqrt(inputX * inputX + inputZ * inputZ);
            playerMesh.position.x += (inputX / length) * moveSpeed * (inputX !== 0 && inputZ !== 0 ? 0.8 : 1);
            playerMesh.position.z += (inputZ / length) * moveSpeed * (inputX !== 0 && inputZ !== 0 ? 0.8 : 1);

            playerMesh.position.x = Math.max(-2.5, Math.min(2.5, playerMesh.position.x));
            playerMesh.position.z = Math.min(20, playerMesh.position.z);

            const targetAngle = Math.atan2(inputX, inputZ) + MODEL_FORWARD_OFFSET;

            if (skeletonModelRef) {
                let diff = targetAngle - skeletonModelRef.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                skeletonModelRef.rotation.y += diff * 0.2;
            }

            if (walkAction && idleAction) {
                idleAction.setEffectiveWeight(0);
                walkAction.setEffectiveWeight(1);
            }
        } else {
            if (walkAction && idleAction) {
                idleAction.setEffectiveWeight(1);
                walkAction.setEffectiveWeight(0);
            }
        }

        // Strict UI Priority Check
        const currentDoor = corridorDoors[activeDoorIndex];
        const promptElem = document.getElementById('interaction-prompt');
        const hintElem = document.getElementById('hint-prompt');
        const distanceToChest = playerMesh.position.distanceTo(chestMesh.position);
        let promptText = null;

        if (distanceToChest < 4.0) {
            if (!chestOpened) {
                promptText = "[ PRESS 'E' TO OPEN CHEST ]";
            } else if (!keyCollected) {
                promptText = "[ PRESS 'E' TO TAKE KEY ]";
            }
        } else if (currentDoor) {
            const distanceToDoor = playerMesh.position.distanceTo(currentDoor.position);
            if (distanceToDoor < 4.5) {
                promptText = "[ PRESS 'E' TO OPEN DOOR ]";
            }
        }

        if (promptText) {
            promptElem.innerText = promptText;
            promptElem.classList.remove('hidden');
        } else {
            promptElem.classList.add('hidden');
        }

        // Display hint "[ Look back ]" if player moves past Door 2 without unlocking Cell 1
        if (hintElem) {
            if (playerMesh.position.z < -26 && !cell1Unlocked) {
                hintElem.classList.remove('hidden');
            } else {
                hintElem.classList.add('hidden');
            }
        }

        if (chestOpened && !keyCollected && keyMesh) {
            const time = Date.now() * 0.003;
            keyMesh.position.y = 0.2 + Math.sin(time) * 0.15;
            keyLight.position.y = keyMesh.position.y;
            keyMesh.rotation.y += 0.02;
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

        arcadeRenderer.render(arcadeScene, arcadeCamera);
    }
    animateArcade();
}

// CELL INSPECTION MODAL (CLEAN BARS ONLY)
function openCellModal(doorIndex) {
    isModalOpen = true;
    document.getElementById('interaction-prompt').classList.add('hidden');
    const modalElem = document.getElementById('cell-modal');
    modalElem.classList.remove('hidden');

    const textElem = document.getElementById('cell-text');
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

    const boneMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, flatShading: true });

    // Clean iron bars across the view
    const barMat = new THREE.MeshStandardMaterial({ color: 0x555555, flatShading: true });
    for (let i = -2.0; i <= 2.0; i += 0.4) {
        const barGeo = new THREE.CylinderGeometry(0.04, 0.04, 3.5, 6);
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.set(i, 0.8, 0);
        cellScene.add(bar);
    }

    if (doorIndex === 0) {
        const lockGeo = new THREE.BoxGeometry(0.3, 0.4, 0.15);
        const lockMat = new THREE.MeshStandardMaterial({ color: cell1Unlocked ? 0x228b22 : 0xcc3333, flatShading: true });
        const lock = new THREE.Mesh(lockGeo, lockMat);
        lock.name = "padlock";
        lock.position.set(0, 0.5, 0.05);
        cellScene.add(lock);

        textElem.innerText = cell1Unlocked 
            ? "[ UNLOCKED // PRESS 'SPACE' TO ENTER ]" 
            : (hasKey ? "[ PRESS 'E' TO UNLOCK PADLOCK ]" : "[ LOCKED // FIND THE CHEST - GET THE KEY ]");
    } else if (doorIndex === 1) {
        textElem.innerText = cellDialogues[1];
        const ribGeo = new THREE.BoxGeometry(0.4, 0.3, 0.4);
        const rib = new THREE.Mesh(ribGeo, boneMat);
        rib.position.set(0.2, 0.5, -0.2);
        cellScene.add(rib);
    } else if (doorIndex === 2) {
        textElem.innerText = cellDialogues[2];
        const boneGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 5);
        const bone = new THREE.Mesh(boneGeo, boneMat);
        bone.rotation.z = 0.5;
        bone.position.set(-0.2, 0.5, 0.3);
        cellScene.add(bone);
    } else if (doorIndex === 3) {
        textElem.innerText = cellDialogues[3];
        const skelGeo = new THREE.BoxGeometry(0.4, 1.2, 0.3);
        const skel = new THREE.Mesh(skelGeo, boneMat);
        skel.position.set(0, 0.5, -0.5);
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

// Fade transition into the empty interior cell
function enterUnlockedCell() {
    closeCellModal();
    const fadeOverlay = document.getElementById('fade-overlay');
    fadeOverlay.classList.add('active');

    setTimeout(() => {
        activeDoorIndex = 1; // Advance to next door in corridor
        
        // Move player position slightly past the cell door in hallway
        if (playerMesh) {
            playerMesh.position.z = -14;
        }

        setTimeout(() => {
            fadeOverlay.classList.remove('active');
        }, 300);
    }, 600);
}

function closeCellModal() {
    isModalOpen = false;
    if (cellAnimId) cancelAnimationFrame(cellAnimId);
    document.getElementById('cell-modal').classList.add('hidden');

    const hintElem = document.getElementById('hint-prompt');
    if (hintElem && cell1Unlocked) {
        hintElem.classList.add('hidden');
    }
}

function triggerRealWorldGlitch() {
    isModalOpen = false;
    document.getElementById('interaction-prompt').classList.add('hidden');

    const glitchOverlay = document.getElementById('real-glitch-overlay');
    glitchOverlay.classList.add('active');

    playSFX('assets/sounds/passingby_glitch.mp3', 0.8);

    setTimeout(() => {
        glitchOverlay.classList.remove('active');
        triggerFinalClimaxScene();
    }, 500);
}

function triggerFinalClimaxScene() {
    isModalOpen = true;
    document.getElementById('interaction-prompt').classList.add('hidden');

    const fadeOverlay = document.getElementById('fade-overlay');
    fadeOverlay.classList.add('active');

    setTimeout(() => {
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

        const finalRenderer = new THREE.WebGLRenderer({ antialias: false });
        finalRenderer.setSize(window.innerWidth, window.innerHeight);
        finalWrapper.appendChild(finalRenderer.domElement);

        const waterLight = new THREE.PointLight(0x00aaff, 3, 15);
        waterLight.position.set(0, 2, -2);
        finalScene.add(waterLight);

        const ambientLight = new THREE.AmbientLight(0x112233, 1.5);
        finalScene.add(ambientLight);

        const tankGeo = new THREE.CylinderGeometry(2, 2, 2.5, 12);
        const tankMat = new THREE.MeshStandardMaterial({ color: 0x0088ff, transparent: true, opacity: 0.6, flatShading: true });
        const tank = new THREE.Mesh(tankGeo, tankMat);
        tank.position.set(0, 0.2, -6);
        finalScene.add(tank);

        const boneMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, flatShading: true });
        const skelGeo = new THREE.BoxGeometry(0.6, 1.5, 0.4);
        const skeleton = new THREE.Mesh(skelGeo, boneMat);
        skeleton.position.set(0, 0.5, -6);
        finalScene.add(skeleton);

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
            finalCamera.position.z -= 0.005;
            finalRenderer.render(finalScene, finalCamera);
        }
        animateFinal();

    }, 1000);
}