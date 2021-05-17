import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.124.0/build/three.module.js"
import { DeviceOrientationControls } from 'https://cdn.jsdelivr.net/npm/three@0.124.0/examples/jsm/controls/DeviceOrientationControls.js'
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.124.0/examples/jsm/loaders/GLTFLoader.js'
import * as coro from 'https://cdn.jsdelivr.net/gh/nasser/ajeeb-coroutines@master/build/coroutines.esm.js'
import * as debug from './debug.js'
import * as gizmos from './gizmos.js'
import * as audio from './audio.js'

const sched = new coro.Schedule()

debug.init()
debug.logUncaughtErrors()

const gltfLoader = new GLTFLoader()

function* waitLoadGltf (url) {
    let value = null
    gltfLoader.load(url, gltf => {
        value = gltf.scene
    })
    while(value === null) yield
    return value
}

function* waitEvent (element, event, cb) {
    let done = false
    element.addEventListener(event, (...args) => {
        done = true
        if(cb) cb(...args)
    })
    while (!done) yield
}

/// game

function gizmoCross (center) {
    gizmos.line(center, center.clone().add(new THREE.Vector3(.1, 0, 0)))
    gizmos.line(center, center.clone().add(new THREE.Vector3(-.1, 0, 0)))
    gizmos.line(center, center.clone().add(new THREE.Vector3(0, 0, .1)))
    gizmos.line(center, center.clone().add(new THREE.Vector3(0, 0, -.1)))
    gizmos.line(center, center.clone().add(new THREE.Vector3(0, .1, 0)))
    gizmos.line(center, center.clone().add(new THREE.Vector3(0, -.1, 0)))
}

function renderCrosshair (camera) {
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.normalize()
    forward.multiplyScalar(2)
    gizmoCross(forward)
}

function collectChildren (obj) {
    const children = {}
    
    for (const c of obj.children) {
        children[c.name] = c
    }

    return children
}

function* beatsMechanic (scene, beatObject) {
    function* beatMovement (beat) {
        while(beat.position.z > -5) {
            beat.position.z -= 0.05 // TODO time delta
            yield
        }

        scene.remove(beat)
    }

    while(true) {
        const beat = beatObject.clone()
        beat.position.z = 15
        beat.rotation.z = Math.random() * Math.PI * 2
        scene.add(beat)
        sched.add(beatMovement(beat))
        yield* coro.wait(1)
    }
}

/// game

function* main () {
    const startButton = document.getElementById('startButton')
    let listener = null
    let renderer, camera, scene, controls
    yield* waitEvent(startButton, 'click', () => {
        listener = audio.initListener()
        const i = init()
        renderer = i.renderer
        camera = i.camera
        scene = i.scene
        controls = i.controls
    })

    gizmos.init(scene)
    audio.init(camera, listener)
    yield* audio.loadSounds('sounds/coin.wav')
    const gltf = yield* waitLoadGltf('objects/ring.glb')
    const assets = collectChildren(gltf)
    const ring = assets.ring.clone()
    scene.add(ring)
    const light = new THREE.AmbientLight(0x404040)
    scene.add(light)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5)
    directionalLight.position.z -= 1
    scene.add(directionalLight)
    sched.add(beatsMechanic(scene, assets.beat))
    while (true) {
        gizmos.reset()
        controls.update()
        renderCrosshair(camera)
        gizmos.draw()
        renderer.render(scene, camera)
        yield
    }
}

function init () {
    const overlay = document.getElementById('overlay')
    overlay.remove()

    const camera = new THREE.PerspectiveCamera(120, window.innerWidth / window.innerHeight, 0.1, 1100)
    const controls = new DeviceOrientationControls(camera)
    const scene = new THREE.Scene()

    const loader = new THREE.TextureLoader()
    const texture = loader.load('prototype-background.png', () => {
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestFilter
        const rt = new THREE.WebGLCubeRenderTarget(texture.image.height)
        rt.fromEquirectangularTexture(renderer, texture)
        scene.background = rt
    })

    const helperGeometry = new THREE.BoxGeometry(100, 100, 100, 4, 4, 4)
    const helperMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true })
    const helper = new THREE.Mesh(helperGeometry, helperMaterial)
    scene.add(helper)

    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(window.innerWidth, window.innerHeight)
    document.body.appendChild(renderer.domElement)

    window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()
        renderer.setSize(window.innerWidth, window.innerHeight)
    })

    return { renderer, scene, camera, controls }
}

sched.add(main)

function tick () {
    requestAnimationFrame(tick)
    sched.tick()
}
tick()
