import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// AUDIO MANAGEMENT SYSTEM
let globalAudioListener = null;
const audioLoader = new THREE.AudioLoader();

// Setup global audio listener attached to active camera
function setupAudio(camera) {
    if (!globalAudioListener) {
        globalAudioListener = new THREE.AudioListener();
        camera.add(globalAudioListener);
    } else if (globalAudioListener.parent !== camera) {
        if (globalAudioListener.parent) {
            globalAudioListener.parent.remove(globalAudioListener);
        }
        camera.add(globalAudioListener);
    }
}

// Play Intro song then Ambient soundtrack seamlessly
function playGameAudioSequence(camera) {
    setupAudio(camera);

    const introSound = new THREE.Audio(globalAudioListener);
    const ambientLoopSound = new THREE.Audio(globalAudioListener);

    // 1. Load intro melody (.mp3)
    audioLoader.load('assets/sounds/Noctambulism_Intro_soundtrack.mp3', function(introBuffer) {
        introSound.setBuffer(introBuffer);
        introSound.setLoop(false);
        introSound.setVolume(0.6);

        // 2. Load ambient soundtrack (.mp3)
        audioLoader.load('assets/sounds/Noctambulism_Ambient_soundtrack.mp3', function(ambientBuffer) {
            ambientLoopSound.setBuffer(ambientBuffer);
            ambientLoopSound.setLoop(true);
            ambientLoopSound.setVolume(0.4);

            // When intro ends, ambient loop triggers automatically
            introSound.onEnded = function() {
                ambientLoopSound.play();
            };
            
            introSound.play();
        });
    }, undefined, function(err) {
        console.warn("Audio load warning:", err);
    });
}

function playSFX(filePath, volume = 0.5) {
    if (!globalAudioListener) return;

    const sound = new THREE.Audio(globalAudioListener);
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

let cellScene, cellCamera, cellRenderer, cellAnimId;
let isModalOpen = false;

// Painting Inspection State
let paintingScene, paintingCamera, paintingRenderer, paintingAnimId;
let isPaintingModalOpen = false;
let paintingMeshModal = null;
let isPaintingHovered = false;
let currentPaintingRotationY = 0;
let paintingSparkles = [];

// Cell 2 Jumpscare State
let cell2InspectedOnce = false;
let cell2JumpscareTriggered = false;
let cell2Timeout = null;

const cellDialogues = [
    "[ ... ]",
    "[ Not here kid. ]",
    "[ Keep... ]",
    "[ YOU SHOULDN'T HAVE LOOKED UP. ]"
];

// Dummy camera used to hold the audio listener on splash screen interaction
let splashAudioCamera = null;

// "HEADPHONES RECOMMENDED" Screen with Smooth Fade-Out & Fade-In to Title Screen
document.getElementById('splash-screen').addEventListener('click', () => {
    const audioCtx = THREE.AudioContext.getContext();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const splashElem = document.getElementById('splash-screen');
    const fadeOverlay = document.getElementById('fade-overlay');

    // Create a dummy camera just to host the audio listener safely
    if (!splashAudioCamera) {
        splashAudioCamera = new THREE.PerspectiveCamera();
    }

    // Initialize audio sequence right on user interaction gesture
    playGameAudioSequence(splashAudioCamera);

    // Fade to black (Fade-out)
    fadeOverlay.classList.add('active');

    setTimeout(() => {
        splashElem.classList.add('hidden'); // Hide headphones screen
        
        // Short delay before fading back in to Title Screen
        setTimeout(() => {
            fadeOverlay.classList.remove('active'); // Fade-in
        }, 400);
    }, 600);
});

// TITLE SCREEN
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
        });

        setTimeout(() => {
            fadeOverlay.classList.remove('active');
        }, 300);
    }, 600);
});

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (e.key === 'Escape') {
        if (isModalOpen) closeCellModal();
        if (isPaintingModalOpen) closePaintingModal();

        if (bedroomAnimId) cancelAnimationFrame(bedroomAnimId);
        if (typeof arcadeAnimId !== 'undefined' && arcadeAnimId) cancelAnimationFrame(arcadeAnimId);
        if (cellIntAnimId) cancelAnimationFrame(cellIntAnimId);

        document.getElementById('arcade-scene').classList.add('hidden');
        document.getElementById('bedroom-scene').classList.add('hidden');
        document.getElementById('cell-interior-scene').classList.add('hidden');
        document.getElementById('title-screen').classList.remove('hidden');
        document.getElementById('fade-overlay').classList.remove('active');
        isTransitioning = false;
        isInCellInterior = false;
        return;
    }

    if (isInCellInterior && key === 'e') {
        leaveCellInterior();
        return;
    }

    if (e.key === ' ' && isModalOpen) {
        if (activeDoorIndex === 0 && cell1Unlocked) {
            enterUnlockedCell();
        } else {
            closeCellModal();
        }
        return;
    }

    if (isModalOpen && activeDoorIndex === 0 && hasKey && !cell1Unlocked && key === 'e') {
        cell1Unlocked = true;
        playSFX('assets/sounds/door_open.mp3', 0.8);
        openCellModal(0);
        return;
    }

    if (!isModalOpen && !isPaintingModalOpen && !isInCellInterior && arcadeScene && playerMesh && chestMesh && key === 'e') {
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

    setupAudio(bedroomCamera);

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
let corridorDoors = [];
let corridorPaintings = [];
let paintingSparkleParticles = [];
let activeDoorIndex = 0;
let cellIntScene, cellIntCamera, cellIntRenderer, cellIntAnimId;
let cellIntYaw = 0;
let cellIntPitch = 0;
let isInCellInterior = false;

const keysPressed = {};

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
let animateArcadeRef = null;
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
    isInCellInterior = false;

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

    setupAudio(arcadeCamera);

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

    // CREATE CORRIDOR PAINTINGS & SPARKLES
    corridorPaintings = [];
    paintingSparkleParticles = [];
    const paintingMat = new THREE.MeshStandardMaterial({ color: 0x2a382a, roughness: 0.8, flatShading: true });

    const p1 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.1), paintingMat);
    p1.position.set(-2.9, 1.2, -38);
    p1.rotation.y = Math.PI / 2;
    p1.userData = { paintingId: 0, text: "Even if it's just" };
    arcadeScene.add(p1);
    corridorPaintings.push(p1);

    const p2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 0.12), paintingMat);
    p2.position.set(2.9, 1.3, -40);
    p2.rotation.y = -Math.PI / 2;
    p2.userData = { paintingId: 1, text: "It is still real" };
    arcadeScene.add(p2);
    corridorPaintings.push(p2);

    const p3 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.1), paintingMat);
    p3.position.set(2.9, 1.2, -52);
    p3.rotation.y = -Math.PI / 2;
    p3.userData = { paintingId: 2, text: "a fever dream now" };
    arcadeScene.add(p3);
    corridorPaintings.push(p3);

    corridorPaintings.forEach(painting => {
        const sparkleGeo = new THREE.BufferGeometry();
        const sparkleCount = 6;
        const positions = new Float32Array(sparkleCount * 3);
        for(let i = 0; i < sparkleCount * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * 1.2;
            positions[i+1] = (Math.random() - 0.5) * 1.6;
            positions[i+2] = (Math.random() - 0.5) * 0.2;
        }
        sparkleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const sparkleMat = new THREE.PointsMaterial({ color: 0x88ffaa, size: 0.12, transparent: true, opacity: 0.8 });
        const sparkles = new THREE.Points(sparkleGeo, sparkleMat);
        sparkles.position.copy(painting.position);
        arcadeScene.add(sparkles);
        paintingSparkleParticles.push(sparkles);
    });

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('click', onCorridorClick);

    function onKeyDown(e) {
        if (isModalOpen || isPaintingModalOpen || isInCellInterior) return;

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

    function onCorridorClick(e) {
        if (isModalOpen || isPaintingModalOpen || isInCellInterior) return;

        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, arcadeCamera);
        const intersects = raycaster.intersectObjects(corridorPaintings);

        if (intersects.length > 0) {
            const hitPainting = intersects[0].object;
            const dist = playerMesh.position.distanceTo(hitPainting.position);
            if (dist < 6.0) {
                openPaintingModal(hitPainting.userData.paintingId, hitPainting.userData.text);
            }
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

    animateArcadeRef = function animateArcade() {
        arcadeAnimId = requestAnimationFrame(animateArcadeRef);

        const delta = clock.getDelta();
        if (skeletonMixer) {
            skeletonMixer.update(delta);
        }

        if (isModalOpen || isPaintingModalOpen || isInCellInterior) {
            if (!isInCellInterior && !isPaintingModalOpen) {
                arcadeRenderer.render(arcadeScene, arcadeCamera);
            }
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

        raycaster.setFromCamera(new THREE.Vector2(0, 0), arcadeCamera);
        const centerPaintingHits = raycaster.intersectObjects(corridorPaintings);
        if (centerPaintingHits.length > 0 && playerMesh.position.distanceTo(centerPaintingHits[0].object.position) < 5.5) {
            document.body.style.cursor = 'pointer';
        } else {
            document.body.style.cursor = 'default';
        }

        const currentDoor = corridorDoors[activeDoorIndex];
        const promptElem = document.getElementById('interaction-prompt');
        const hintElem = document.getElementById('hint-prompt');
        const distanceToChest = playerMesh.position.distanceTo(chestMesh.position);
        let promptText = null;

        if (centerPaintingHits.length > 0 && playerMesh.position.distanceTo(centerPaintingHits[0].object.position) < 5.5) {
            promptText = "[ CLICK TO INSPECT PAINTING ]";
        } else if (distanceToChest < 4.0) {
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

        paintingSparkleParticles.forEach((particles, idx) => {
            particles.rotation.y += 0.01;
            const positions = particles.geometry.attributes.position.array;
            for(let i = 1; i < positions.length; i += 3) {
                positions[i] += Math.sin(Date.now() * 0.003 + i) * 0.002;
            }
            particles.geometry.attributes.position.needsUpdate = true;
        });

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
    };
    animateArcadeRef();
}

// PAINTING INSPECTION MODAL
function openPaintingModal(paintingId, paintingText) {
    isPaintingModalOpen = true;
    document.getElementById('interaction-prompt').classList.add('hidden');
    const modalElem = document.getElementById('painting-modal');
    modalElem.classList.remove('hidden');

    const textElem = document.getElementById('painting-text');
    textElem.innerText = "[ HOVER OVER PAINTING TO REVEAL ]";

    const container = document.getElementById('painting-canvas-container');
    container.innerHTML = '';

    paintingScene = new THREE.Scene();
    paintingScene.background = new THREE.Color(0x020402);

    paintingCamera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
    paintingCamera.position.set(0, 0, 3);
    paintingCamera.lookAt(0, 0, 0);

    paintingRenderer = new THREE.WebGLRenderer({ antialias: false });
    paintingRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(paintingRenderer.domElement);

    const light = new THREE.PointLight(0x88aa88, 2, 10);
    light.position.set(0, 2, 2);
    paintingScene.add(light);

    const ambientLight = new THREE.AmbientLight(0x334433, 1.2);
    paintingScene.add(ambientLight);

    const pGeo = paintingId === 1 ? new THREE.BoxGeometry(2.0, 2.4, 0.1) : new THREE.BoxGeometry(1.2, 1.6, 0.08);
    const pMat = new THREE.MeshStandardMaterial({ color: 0x1f331f, roughness: 0.5, flatShading: true });
    
    paintingMeshModal = new THREE.Mesh(pGeo, pMat);
    paintingScene.add(paintingMeshModal);

    currentPaintingRotationY = 0;
    isPaintingHovered = false;

    const canvasElem = paintingRenderer.domElement;

    function handleMouseMove(e) {
        const rect = canvasElem.getBoundingClientRect();
        const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(mx, my), paintingCamera);
        const hits = ray.intersectObject(paintingMeshModal);

        if (hits.length > 0) {
            isPaintingHovered = true;
            textElem.innerText = `[ "${paintingText}" ]`;
            document.body.style.cursor = 'pointer';
        } else {
            isPaintingHovered = false;
            textElem.innerText = "[ HOVER OVER PAINTING TO REVEAL ]";
            document.body.style.cursor = 'default';
        }
    }

    function handleClick(e) {
        const rect = canvasElem.getBoundingClientRect();
        const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(mx, my), paintingCamera);
        const hits = ray.intersectObject(paintingMeshModal);

        if (hits.length > 0) {
            closePaintingModal();
        }
    }

    canvasElem.addEventListener('mousemove', handleMouseMove);
    canvasElem.addEventListener('click', handleClick);

    function animatePainting() {
        if (!isPaintingModalOpen) return;
        paintingAnimId = requestAnimationFrame(animatePainting);

        const targetRotY = isPaintingHovered ? Math.PI : 0;
        currentPaintingRotationY += (targetRotY - currentPaintingRotationY) * 0.15;
        paintingMeshModal.rotation.y = currentPaintingRotationY;

        paintingRenderer.render(paintingScene, paintingCamera);
    }
    animatePainting();
}

function closePaintingModal() {
    isPaintingModalOpen = false;
    document.body.style.cursor = 'default';
    if (paintingAnimId) cancelAnimationFrame(paintingAnimId);
    document.getElementById('painting-modal').classList.add('hidden');
}

// CELL 2 INSPECTION MODAL WITH JUMPSCARE
function openCellModal(doorIndex) {
    isModalOpen = true;
    document.getElementById('interaction-prompt').classList.add('hidden');
    const modalElem = document.getElementById('cell-modal');
    modalElem.classList.remove('hidden');

    const textElem = document.getElementById('cell-text');
    const container = document.getElementById('cell-canvas-container');
    container.innerHTML = '';

    // JUMPSCARE CELL2
    if (doorIndex === 1 && cell2InspectedOnce) {
        cell2JumpscareTriggered = true;
        container.style.backgroundColor = '#000000';
        textElem.innerText = "[ ... ]";

        // Timeout for BOOM (SFX Explosion + GIF)
        cell2Timeout = setTimeout(() => {
            playSFX('assets/sounds/explosion_sound.mp3', 0.9); // Explosion/Glitch sound

            container.innerHTML = `<video src="assets/images/skeleton_dancin.mp4" class="jumpscare-gif" autoplay loop muted playsinline></video>`;
            textElem.innerText = "[ BOOM // DANCE OFF HEHE ]";
        }, 1000); // 1 second before jumpscare

        return;
    }

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

function closeCellModal() {
    isModalOpen = false;
    if (cellAnimId) cancelAnimationFrame(cellAnimId);
    if (cell2Timeout) clearTimeout(cell2Timeout);
    document.getElementById('cell-modal').classList.add('hidden');

    // If just closed Cell 2 for the first time, activate hint
    if (activeDoorIndex === 1 && !cell2InspectedOnce) {
        cell2InspectedOnce = true;
        const cell2Hint = document.getElementById('cell2-hint-prompt');
        if (cell2Hint) {
            cell2Hint.classList.remove('hidden');
        }
    }

    // After jumpscare, hint hides
    if (cell2JumpscareTriggered) {
        const cell2Hint = document.getElementById('cell2-hint-prompt');
        if (cell2Hint) cell2Hint.classList.add('hidden');
    }

    const hintElem = document.getElementById('hint-prompt');
    if (hintElem && cell1Unlocked) {
        hintElem.classList.add('hidden');
    }
}

function enterUnlockedCell() {
    closeCellModal();
    document.getElementById('interaction-prompt').classList.add('hidden');

    const fadeOverlay = document.getElementById('fade-overlay');
    fadeOverlay.classList.add('active');

    setTimeout(() => {
        if (arcadeAnimId) cancelAnimationFrame(arcadeAnimId);

        document.getElementById('arcade-scene').classList.add('hidden');
        const cellIntElem = document.getElementById('cell-interior-scene');
        cellIntElem.classList.remove('hidden');

        isInCellInterior = true;
        initCellInterior3D();

        const promptElem = document.getElementById('interaction-prompt');
        promptElem.innerText = "[ PRESS 'E' TO LEAVE ]";
        promptElem.classList.remove('hidden');

        setTimeout(() => {
            fadeOverlay.classList.remove('active');
        }, 400);
    }, 600);
}

function leaveCellInterior() {
    const fadeOverlay = document.getElementById('fade-overlay');
    fadeOverlay.classList.add('active');

    setTimeout(() => {
        if (cellIntAnimId) cancelAnimationFrame(cellIntAnimId);

        document.getElementById('cell-interior-scene').classList.add('hidden');
        document.getElementById('arcade-scene').classList.remove('hidden');
        document.getElementById('interaction-prompt').classList.add('hidden');

        isInCellInterior = false;
        activeDoorIndex = 1;

        if (playerMesh) {
            playerMesh.position.set(0, 0, -14);
        }

        if (animateArcadeRef) {
            animateArcadeRef();
        }

        setTimeout(() => {
            fadeOverlay.classList.remove('active');
        }, 400);
    }, 600);
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

// CELL 1 INTERIOR
function initCellInterior3D() {
    const container = document.getElementById('cell-interior-scene');
    container.innerHTML = '<div class="arcade-wrapper" id="cell-int-canvas"></div>';
    const wrapper = document.getElementById('cell-int-canvas');

    cellIntScene = new THREE.Scene();
    const roomColor = 0x050d05;
    cellIntScene.background = new THREE.Color(roomColor);
    cellIntScene.fog = new THREE.FogExp2(roomColor, 0.03);

    cellIntCamera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
    cellIntCamera.position.set(0, 0.6, 0);

    cellIntRenderer = new THREE.WebGLRenderer({ antialias: false });
    cellIntRenderer.setSize(window.innerWidth, window.innerHeight);
    wrapper.appendChild(cellIntRenderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x334433, 1.5);
    cellIntScene.add(ambientLight);

    const cellLight = new THREE.PointLight(0x66aa66, 2.5, 12);
    cellLight.position.set(0, 2.5, 0);
    cellIntScene.add(cellLight);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x162616, flatShading: true });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0d1a0d, flatShading: true });

    const floorGeo = new THREE.PlaneGeometry(8, 8);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1, 0);
    cellIntScene.add(floor);

    const ceil = new THREE.Mesh(floorGeo, floorMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 3, 0);
    cellIntScene.add(ceil);

    const wallGeoHoriz = new THREE.BoxGeometry(8, 4, 0.4);
    const wallGeoVert = new THREE.BoxGeometry(0.4, 4, 8);

    const backWall = new THREE.Mesh(wallGeoHoriz, wallMat);
    backWall.position.set(0, 1, -4);
    cellIntScene.add(backWall);

    const leftWall = new THREE.Mesh(wallGeoVert, wallMat);
    leftWall.position.set(-4, 1, 0);
    cellIntScene.add(leftWall);

    const rightWall = new THREE.Mesh(wallGeoVert, wallMat);
    rightWall.position.set(4, 1, 0);
    cellIntScene.add(rightWall);

    const frontWall = new THREE.Mesh(wallGeoHoriz, wallMat);
    frontWall.position.set(0, 1, 4);
    cellIntScene.add(frontWall);

    const barMat = new THREE.MeshStandardMaterial({ color: 0x444444, flatShading: true });
    for (let i = -1.8; i <= 1.8; i += 0.6) {
        const barGeo = new THREE.CylinderGeometry(0.04, 0.04, 4, 6);
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.set(i, 1, 3.8);
        cellIntScene.add(bar);
    }

    cellIntYaw = 0;
    cellIntPitch = 0;

    function onCellMouseMove(e) {
        if (!isInCellInterior) return;
        const sensitivity = 0.0025;
        cellIntYaw -= e.movementX * sensitivity;
        cellIntPitch -= e.movementY * sensitivity;

        cellIntPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, cellIntPitch));
    }

    window.addEventListener('mousemove', onCellMouseMove);

    function animateCellInterior() {
        if (!isInCellInterior) {
            window.removeEventListener('mousemove', onCellMouseMove);
            return;
        }

        cellIntAnimId = requestAnimationFrame(animateCellInterior);

        cellIntCamera.rotation.order = 'YXZ';
        cellIntCamera.rotation.y = cellIntYaw;
        cellIntCamera.rotation.x = cellIntPitch;

        cellIntRenderer.render(cellIntScene, cellIntCamera);
    }
    animateCellInterior();
}