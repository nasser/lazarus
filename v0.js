import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.124.0/build/three.module.js"
import { DeviceOrientationControls } from 'https://cdn.jsdelivr.net/npm/three@0.124.0/examples/jsm/controls/DeviceOrientationControls.js'
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.124.0/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.124.0/examples/jsm/loaders/GLTFLoader.js'
import * as coro from 'https://cdn.jsdelivr.net/gh/nasser/ajeeb-coroutines@master/build/coroutines.esm.js'
import * as debug from './debug.js'
import * as gizmos from './gizmos.js'
import * as audio from './audio.js'
import { Input, time } from './input.js'
import { levelData } from './level.js'

const input = new Input([
    time
])

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
    // assumes camera is at origin
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

window._frameLog = new Map()

function fl(...args) {
    let log = window._frameLog.get(input.now.time.frame)
    if(!log)
        log = []
    log.push(args)
    window._frameLog.set(input.now.time.frame, log)
}

const _beats = []

function* beatsMechanic (sched, scene, beatObject, timestamps=[]) {
    const initial = input.now.time.now
    const startDistance = 15
    const removeDistance = -5
    const approachSpeed = 2 // unit per second
    const timeToZero = startDistance / approachSpeed
    const adjustedTimestamps = timestamps.map(t => t - timeToZero)
    const delays = adjustedTimestamps.map((t, i) => t - adjustedTimestamps[i-1] || t)
    console.log('[initial]', initial);
    console.log('[timeToZero]', timeToZero);

    function* beatMovement (beat) {
        while(beat.position.z > removeDistance) {
            beat.position.z -= approachSpeed * input.now.audioTime.delta
            yield
        }

        scene.remove(beat)
    }

    let angle = 0
    let prev = null

    for (const delay of delays) {
        yield* coro.wait(delay)
        const beat = beatObject.clone()
        _beats.push(beat)
        beat.position.z = startDistance
        beat.rotation.z = angle
        angle += Math.PI / 4
        scene.add(beat)
        sched.add(beatMovement(beat))
        prev = beat
    }
}

function audioTime(audio) {
    return function audioTime(_, prev) {
        let now = audio.context.currentTime
        let delta = !prev ? 0 : now - prev.audioTime.now;
        return { now, delta }
    }
}

/// game

function* main () {
    const overlay = document.getElementById('overlay')
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
    startButton.setAttribute('disabled', true)

    gizmos.init(scene)
    audio.init(camera, listener)
    startButton.textContent = "Loading Audio..."
    const audioBuffers = yield* audio.loadSounds('sounds/coin.wav', 'audio/music/benjamin-banger.mp3')
    const sound = new THREE.Audio(listener)
    sound.setBuffer(audioBuffers['audio/music/benjamin-banger.mp3'])
    sound.setLoop(false)
    sound.setVolume(1)

    input.inputPipeline.push(audioTime(sound)) // ???

    startButton.textContent = "Loading Geometry..."
    const gltf = yield* waitLoadGltf('objects/ring.glb')
    const assets = collectChildren(gltf)
    const ring = assets.ring.clone()
    scene.add(ring)
    const light = new THREE.AmbientLight(0x404040)
    scene.add(light)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5)
    directionalLight.position.z -= 1
    scene.add(directionalLight)
    overlay.remove()

    const gameSched = new coro.Schedule()

    gameSched.add(function* () {
        yield* coro.wait(0)
        sound.play()
        gameSched.add(beatsMechanic(gameSched, scene, assets.beat, levelData))
    })
    
    while (true) {
        input.update()
        gizmos.reset()
        controls.update()
        renderCrosshair(camera)
        gameSched.tick()
        for (let i = 0; i < _beats.length-1; i++) {
            const a = _beats[i]
            const b = _beats[i+1]
            a.geometry.computeBoundingSphere()
            b.geometry.computeBoundingSphere()
            let aa = a.geometry.boundingSphere.center.clone()
            let bb = b.geometry.boundingSphere.center.clone()
            aa = a.localToWorld(aa)
            bb = b.localToWorld(bb)
            gizmos.line(aa, bb)
        }
        gizmos.draw()
        renderer.render(scene, camera)
        yield
    }
}

function init () {
    const renderer = new THREE.WebGLRenderer({ antialias: false })
    const camera = new THREE.PerspectiveCamera(120, window.innerWidth / window.innerHeight, 0.1, 1100)
    // camera.position.z -= 5
    const controls = new DeviceOrientationControls(camera)
    // const controls = new OrbitControls(camera, renderer.domElement)
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
