import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.124.0/build/three.module.js";
import { DeviceOrientationControls } from 'https://cdn.jsdelivr.net/npm/three@0.124.0/examples/jsm/controls/DeviceOrientationControls.js';
import * as coro from 'https://cdn.jsdelivr.net/gh/nasser/ajeeb-coroutines@master/build/coroutines.esm.js'
import * as debug from './debug.js'
import * as gizmos from './gizmos.js'
import * as audio from './audio.js'

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

//// game

function gizmoCross(center) {
    gizmos.line(center, center.clone().add(new THREE.Vector3(.1, 0, 0)))
    gizmos.line(center, center.clone().add(new THREE.Vector3(-.1, 0, 0)))
    gizmos.line(center, center.clone().add(new THREE.Vector3(0, 0, .1)))
    gizmos.line(center, center.clone().add(new THREE.Vector3(0, 0, -.1)))
    gizmos.line(center, center.clone().add(new THREE.Vector3(0, .1, 0)))
    gizmos.line(center, center.clone().add(new THREE.Vector3(0, -.1, 0)))
}

function cameraCastMechanic (camera) {
    let forward = new THREE.Vector3();
    const center = new THREE.Vector2(0, 0);
    const raycaster = new THREE.Raycaster()
    camera.spherical = { t:0, p:0 }

    return function(cubes) {
        raycaster.setFromCamera( center, camera );        
        const intersects = raycaster.intersectObjects( cubes );
        for (const obj of intersects) {
            if(obj.distance < 2.5 && obj.distance > 1.5)
                obj.object.userData.dead = true
        }
        
        camera.getWorldDirection( forward );
        forward.normalize()
        forward.multiplyScalar(2)
        gizmoCross(forward)
    }
}

function sphericalToCartesian(r, t, p) {
    let x = r * Math.sin(t) * Math.cos(p)
    let y = r * Math.sin(t) * Math.sin(p)
    let z = r * Math.cos(t)
    return [x, y, z]
}

function cuboid(scene, r, t, p) {
    let [x, y, z] = sphericalToCartesian(r, t, p)
    const geometry = new THREE.BoxGeometry( .2, .2, .2 );
    const material = new THREE.MeshBasicMaterial( { color: "red" } );
    const cube = new THREE.Mesh( geometry, material );
    cube.userData.dead = false
    cube.position.set(x, y, z)

    scene.add( cube );
    sched.add(function*() {
        while(!cube.userData.dead && r > 0) {
            r -= 0.125
            
            let [x, y, z] = sphericalToCartesian(r, t, p)
            cube.position.set(x, y, z)
            cube.rotateX(.01)
            cube.rotateY(.01)
            yield
        }
        if(cube.userData.dead) {
            audio.play('sounds/coin.wav')
            // score += 1
        }
        scene.remove(cube)
    })
    return cube
}

function makeCubes(scene) {
    const cubes = []
    const noise = new SimplexNoise()
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
            const k = i*10+j
            let t = noise.noise2D(k*.01, k*.01) * Math.PI
            let p = noise.noise2D(-k*.01, -k*.01) * Math.PI
            cubes.push(cuboid(scene, 10 + k*2, t, p))
        }
    }
    return cubes
}

//// game

function* main() {
    const startButton = document.getElementById('startButton');
    yield* waitEvent(startButton, 'click')

    const { renderer, camera, scene, controls } = init()
    gizmos.init(scene)
    audio.init(camera)
    yield* audio.loadSounds('sounds/coin.wav')
    const cubes = makeCubes(scene)
    const mechanic = cameraCastMechanic(camera)
    while (true) {
        gizmos.reset()
        controls.update();
        mechanic(cubes)
        gizmos.draw()
        renderer.render(scene, camera);
        yield
    }
}

function init() {

    const overlay = document.getElementById('overlay');
    overlay.remove();

    let camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1100);

    let controls = new DeviceOrientationControls(camera);

    let scene = new THREE.Scene();

    const loader = new THREE.TextureLoader();
    const texture = loader.load('prototype-background.png', () => {
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestFilter
        const rt = new THREE.WebGLCubeRenderTarget(texture.image.height);
        rt.fromEquirectangularTexture(renderer, texture);
        scene.background = rt;
    })

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

sched.add(main)

function tick() {
    requestAnimationFrame(tick);
    sched.tick();
}
tick()