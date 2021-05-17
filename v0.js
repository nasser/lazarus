import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.124.0/build/three.module.js"
import { DeviceOrientationControls } from 'https://cdn.jsdelivr.net/npm/three@0.124.0/examples/jsm/controls/DeviceOrientationControls.js'
import * as coro from 'https://cdn.jsdelivr.net/gh/nasser/ajeeb-coroutines@master/build/coroutines.esm.js'
import * as debug from './debug.js'
import * as gizmos from './gizmos.js'
import * as audio from './audio.js'

const sched = new coro.Schedule()

debug.init()
debug.logUncaughtErrors()

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

function sphericalToCartesian (r, t, p) {
    const x = r * Math.sin(t) * Math.cos(p)
    const y = r * Math.sin(t) * Math.sin(p)
    const z = r * Math.cos(t)
    return [x, y, z]
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

    // const { renderer, camera, scene, controls } = init()
    gizmos.init(scene)
    audio.init(camera, listener)
    yield* audio.loadSounds('sounds/coin.wav')
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

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1100)
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
