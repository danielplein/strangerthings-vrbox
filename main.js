import * as THREE from 'three';
import { GLTFLoader } from 'GLTFLoader';
import { OrbitControls } from 'OrbitControls'; // Para debug no desktop

// --- Variáveis globais ---
let scene, camera, renderer;
let handCursor;
let isPinching = false;
let raycaster, mouse; // Usaremos 'mouse' para o raycaster apontar para o cursor da mão
let currentInteractedObject = null;
let rig; // A entidade que representa o jogador (câmera e seu movimento)

const interactables = []; // Armazenará os personagens e objetos com os quais podemos interagir

// --- Configuração MediaPipe ---
const videoElement = document.getElementById('input_video');
const loadingScreen = document.getElementById('loading-screen');

// --- Iniciar a cena 3D e o MediaPipe ---
init();
animate();

async function init() {
    // SCENE
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505); // Céu noturno do Mundo Invertido
    scene.fog = new THREE.FogExp2(0x0a0a0a, 0.05); // Névoa densa

    // CAMERA
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 0); // Câmera dentro do rig

    // RIG DO JOGADOR (onde a câmera estará anexada)
    rig = new THREE.Group();
    rig.position.set(0, 1.6, 0); // Altura dos olhos
    rig.add(camera);
    scene.add(rig);

    // RENDERER
    const canvas = document.getElementById('three-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true; // Habilitar sombras
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // CONTROLES (APENAS PARA DEBUG NO DESKTOP, REMOVER EM PRODUÇÃO)
    // const controls = new OrbitControls(camera, renderer.domElement);
    // controls.target.set(0, 1.6, -5);
    // controls.update();

    // ILUMINAÇÃO
    const ambientLight = new THREE.AmbientLight(0x404040, 0.7); // Luz ambiente
    scene.add(ambientLight);

    const spotLight = new THREE.SpotLight(0xffffff, 2, 20, Math.PI * 0.15, 0.5, 0.5); // Lanterna
    spotLight.position.set(0, 0, 0); // Fica na câmera
    spotLight.target.position.set(0, 0, -1);
    camera.add(spotLight); // Anexar à câmera para mover junto
    scene.add(spotLight.target);

    // RAYCASTER para detecção de interação e teletransporte
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2(); // Representará a posição do cursor da mão

    // CURSOR DA MÃO VIRTUAL
    const cursorGeometry = new THREE.RingGeometry(0.02, 0.03, 32);
    const cursorMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    handCursor = new THREE.Mesh(cursorGeometry, cursorMaterial);
    handCursor.position.set(0, 0, -1.5); // Posição inicial na frente da câmera
    camera.add(handCursor); // Anexar à câmera para que se mova com ela

    // --- Carregar Modelos 3D (GLTF) ---
    const loader = new GLTFLoader();

    // CHÃO
    const floorGeometry = new THREE.PlaneGeometry(50, 50);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'floor'; // Para o raycaster identificar o chão
    scene.add(floor);
    interactables.push(floor); // O chão também é um interactable para teletransporte

    // CASA (Simplificado para caixas, mas aqui você carregaria house.glb)
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.8, metalness: 0.1 });
    
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(20, 4, 0.5), wallMaterial);
    frontWall.position.set(0, 2, -10);
    frontWall.castShadow = true;
    frontWall.receiveShadow = true;
    scene.add(frontWall);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 20), wallMaterial);
    leftWall.position.set(-10, 2, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 20), wallMaterial);
    rightWall.position.set(10, 2, 0);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    // PERSONAGENS (Carregando GLTF se você tiver os arquivos)
    // Se não tiver, ainda usaremos cilindros, mas vamos descrever como carregar o GLTF
    
    // Mike
    await loadCharacter(loader, 'assets/models/mike.glb', -2, 0, -5, 'Mike');
    
    // Dustin
    await loadCharacter(loader, 'assets/models/dustin.glb', 2, 0, -5, 'Dustin');

    // Nancy
    await loadCharacter(loader, 'assets/models/nancy.glb', 0, 0, -12, 'Nancy');

    // Luzes de Natal (usando spheres como placeholders, mas com animação)
    createChristmasLights(new THREE.Vector3(0, 3, -9.8));

    // AUDIO
    setupAudio();

    // --- Iniciar MediaPipe Hands ---
    const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
    });
    hands.onResults(onResults);

    const cameraUtils = new Camera(videoElement, {
        onFrame: async () => {
            await hands.send({ image: videoElement });
        },
        width: 640,
        height: 480
    });

    try {
        await cameraUtils.start();
        loadingScreen.style.display = 'none'; // Esconder tela de carregamento
        console.log("Câmera MediaPipe iniciada.");
    } catch (error) {
        console.error("Falha ao iniciar a câmera MediaPipe:", error);
        loadingScreen.innerHTML = "<p>Erro: Não foi possível acessar a câmera. Por favor, permita o acesso e recarregue a página.</p>";
    }

    window.addEventListener('resize', onWindowResize, false);
}

// --- Funções de Ajuda ---

async function loadCharacter(loader, path, x, y, z, name) {
    let characterMesh;
    try {
        const gltf = await loader.loadAsync(path);
        characterMesh = gltf.scene;
        characterMesh.scale.set(0.5, 0.5, 0.5); // Ajustar escala conforme o modelo
        characterMesh.position.set(x, y, z);
        characterMesh.name = name;
        characterMesh.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        scene.add(characterMesh);
        interactables.push(characterMesh); // Adicionar à lista de interáveis
        console.log(`Modelo ${name} carregado.`);
    } catch (error) {
        console.warn(`Não foi possível carregar o modelo ${path} para ${name}. Usando placeholder.`);
        // Fallback para cilindro se o modelo GLTF falhar
        const geometry = new THREE.CylinderGeometry(0.4, 0.4, 1.7, 32);
        const material = new THREE.MeshStandardMaterial({ color: 0xAAAAAA });
        characterMesh = new THREE.Mesh(geometry, material);
        characterMesh.position.set(x, y + 0.85, z); // Ajusta a posição para o centro da base do cilindro
        characterMesh.name = name;
        characterMesh.castShadow = true;
        characterMesh.receiveShadow = true;
        scene.add(characterMesh);
        interactables.push(characterMesh);
        
        // Adiciona um texto simples acima
        const textLoader = new THREE.FontLoader(); // Precisa de um FontLoader e uma fonte .json
        // Por simplicidade, usaremos um Sprite ou Mesh com texto mais tarde se necessário.
        // Ou simplesmente adicione um plano com a imagem do nome.
    }
}

function createChristmasLights(position) {
    const lightColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00];
    const lightGroup = new THREE.Group();
    lightGroup.position.copy(position);

    for (let i = 0; i < 4; i++) {
        const lightGeometry = new THREE.SphereGeometry(0.1, 16, 16);
        const lightMaterial = new THREE.MeshBasicMaterial({ color: lightColors[i % lightColors.length] });
        const light = new THREE.Mesh(lightGeometry, lightMaterial);
        light.position.x = (i - 1.5) * 0.5; // Espaçamento
        light.name = `christmasLight-${i}`;
        lightGroup.add(light);

        // Animação de opacidade para simular piscar
        new TWEEN.Tween(light.material)
            .to({ opacity: 0.2 }, 500 + Math.random() * 500)
            .yoyo(true)
            .repeat(Infinity)
            .start();
    }
    scene.add(lightGroup);
}

function setupAudio() {
    const listener = new THREE.AudioListener();
    camera.add(listener);

    // Música ambiente (baixo volume)
    const ambientSound = new THREE.Audio(listener);
    const audioLoader = new THREE.AudioLoader();
    audioLoader.load('assets/sounds/theme.mp3', function(buffer) {
        ambientSound.setBuffer(buffer);
        ambientSound.setLoop(true);
        ambientSound.setVolume(0.1); // Volume baixo
        ambientSound.play();
    });

    // SFX de teletransporte
    teleportSfx.setMediaElement(document.createElement('audio')); // Para controlar o volume
    teleportSfx.setVolume(0.5); // Volume médio
    audioLoader.load('assets/sounds/teleport.mp3', function(buffer) {
        teleportSfx.setBuffer(buffer);
    });
}


function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- MediaPipe Callback ---
function onResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const hand = results.multiHandLandmarks[0];
        
        const thumbTip = hand[4];
        const indexTip = hand[8];

        // Normaliza as coordenadas da mão para o espaço da tela (-1 a 1)
        mouse.x = (indexTip.x - 0.5) * -2; // Invertido no X para espelhar a câmera frontal
        mouse.y = (indexTip.y - 0.5) * -2;

        // Atualiza a posição do cursor da mão 3D
        handCursor.position.x = mouse.x * 0.5; // Ajuste de sensibilidade
        handCursor.position.y = mouse.y * 0.5;
        handCursor.position.z = -1.5;


        // Rotação da câmera baseada na posição do dedo indicador (para quem não tem giroscópio)
        const rotationSpeed = 0.03;
        if (indexTip.x < 0.2) rig.rotation.y += rotationSpeed; // Gira para a esquerda
        if (indexTip.x > 0.8) rig.rotation.y -= rotationSpeed; // Gira para a direita
        
        // --- Lógica de Teletransporte por Pinça ---
        const distance = Math.sqrt(
            Math.pow(thumbTip.x - indexTip.x, 2) + 
            Math.pow(thumbTip.y - indexTip.y, 2)
        );

        if (distance < 0.05) { // Limiar para detectar o "pinça"
            if (!isPinching) {
                isPinching = true;
                executeTeleport();
            }
        } else {
            isPinching = false;
        }
    }
}

function executeTeleport() {
    // Aponta o raycaster do centro da câmera para a posição do cursor da mão
    raycaster.setFromCamera(mouse, camera); 
    
    // Filtra apenas o chão para teletransporte
    const intersects = raycaster.intersectObjects(interactables.filter(obj => obj.name === 'floor')); 

    if (intersects.length > 0) {
        const target = intersects[0].point;
        
        if (teleportSfx.buffer) { // Verifica se o buffer foi carregado
            teleportSfx.play();
        } else {
            console.warn("Teleport SFX not loaded yet.");
        }

        // Move a rig do jogador
        rig.position.set(target.x, 1.6, target.z);
    }
}

// --- Loop de Animação ---
function animate() {
    requestAnimationFrame(animate);

    // Interação com objetos (Raycaster sempre atualizando)
    if (handCursor) {
        // O raycaster já está apontando para o mouse (cursor da mão) na função onResults
        raycaster.setFromCamera(mouse, camera); // Redundante mas garante atualização

        const intersects = raycaster.intersectObjects(interactables.filter(obj => obj.name !== 'floor'));
        
        if (intersects.length > 0) {
            const object = intersects[0].object;
            // Percorre a hierarquia para encontrar o objeto raiz interactable
            let parentInteractable = object;
            while (parentInteractable && !interactables.includes(parentInteractable)) {
                parentInteractable = parentInteractable.parent;
            }

            if (parentInteractable && parentInteractable !== currentInteractedObject) {
                // Novo objeto interagido
                console.log("Interagindo com:", parentInteractable.name);
                // Trigger SFX ou animação
                if (parentInteractable.name === 'Dustin') {
                    // Exemplo: tocar um som do Dustin
                }
                currentInteractedObject = parentInteractable;
            }
        } else {
            // Não está interagindo com nada
            if (currentInteractedObject) {
                console.log("Parou de interagir com:", currentInteractedObject.name);
                currentInteractedObject = null;
            }
        }
    }
    
    renderer.render(scene, camera);
}
