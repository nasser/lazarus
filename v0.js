import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.124.0/build/three.module.js";
import { DeviceOrientationControls } from 'https://cdn.jsdelivr.net/npm/three@0.124.0/examples/jsm/controls/DeviceOrientationControls.js';
import * as coro from 'https://cdn.jsdelivr.net/gh/nasser/ajeeb-coroutines@master/build/coroutines.esm.js'
import * as debug from './debug.js'

const sched = new coro.Schedule()

debug.init()

window.onerror = function (message, source, lineno, colno, error) {
    for (const line of error.stack.split("\n")) {
        debug.log(line)
    }
}

function* waitEvent(element, event) {
    let done = false
    element.addEventListener(event, () => done = true)
    while (!done) yield
}

sched.add(function* () {
    const startButton = document.getElementById('startButton');
    yield* waitEvent(startButton, 'click')

    const { renderer, camera, scene, controls } = init()

    while (true) {
        controls.update();
        renderer.render(scene, camera);
        yield
    }
})

function init() {

    const overlay = document.getElementById('overlay');
    overlay.remove();

    let camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1100);

    let controls = new DeviceOrientationControls(camera);

    let scene = new THREE.Scene();

    const loader = new THREE.TextureLoader();
    const texture = loader.load('prototype-background.png')
    loader.manager.onLoad = function () {
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestFilter
        const rt = new THREE.WebGLCubeRenderTarget(texture.image.height);
        rt.fromEquirectangularTexture(renderer, texture);
        scene.background = rt;
    }

    const helperGeometry = new THREE.BoxGeometry(100, 100, 100, 4, 4, 4);
    const helperMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
    const helper = new THREE.Mesh(helperGeometry, helperMaterial);
    scene.add(helper);

    let renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { renderer, scene, camera, controls }
}

function tick() {
    requestAnimationFrame(tick);
    sched.tick();
}
tick()