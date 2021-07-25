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

const input = new Input([
    time
])

/**
 * @param {THREE.Audio} audio
 * @returns an input function returning { now, delta } based on audio time
 */
function audioTime(audio) {
    let startTime = null
    let playhead = 0
    let accumulated = 0
    let playing = false
    return function audioTime(_, prev) {
        if(!playing && audio.isPlaying) {
            startTime = audio.context.currentTime
        } else if(playing && !audio.isPlaying) {
            accumulated = playhead
        }
        playing = audio.isPlaying;
        if(playing)
            playhead = accumulated + audio.context.currentTime - startTime
        
        let now = playhead
        let delta = !prev ? 0 : now - prev.audioTime.now;
        return { now, delta }
    }
}
// https://stackoverflow.com/a/2007279
function angleDifference(x, y) {
    return Math.atan2(Math.sin(x-y), Math.cos(x-y))
}

function cameraEuler(camera) {
    return function cameraEuler(_, prev) {
        const now = camera.rotation.clone()
        const delta = new THREE.Euler()
        if(prev?.cameraEuler)
            delta.set( angleDifference(now.x, prev.cameraEuler.now.x),
                       angleDifference(now.y, prev.cameraEuler.now.y),
                       angleDifference(now.z, prev.cameraEuler.now.z) )
        
        return { now, delta }
    }
}

const threshold = 0.05
function direction(input) {
    const right = input.cameraEuler.delta.y < -threshold
    const left = input.cameraEuler.delta.y >= threshold
    const down = input.cameraEuler.delta.x < -threshold
    const up = input.cameraEuler.delta.x >= threshold
    return { left, right, up, down }
}

/**
 * @param {THREE.Object3D} obj the object to traverse
 * @returns an object that maps child names to children
 */
function collectChildren (obj) {
    const children = {}
    
    for (const c of obj.children) {
        children[c.name] = c
    }

    return children
}

function* beatsMechanic (sched, scene, camera, arrowObject, trailPrototype, sound, levelData=[]) {
    const bpm = 80
    const bps = bpm / 60
    const spb = 1 / bps
    
    let angle = 0
    let bb = 0
    const _levelData = levelData.map(({time }) => {
        angle = (angle + 1) % 4
        return { time:(bb++) * spb, angle, duration:.25 }
    })
    
    function* arrowMovement (arrowPrototype, data) {
        const arrow = arrowPrototype.clone()
        const trail = trailPrototype.clone()
        trail.scale.z = data.duration
        scene.add(arrow)
        arrow.add(trail)
        const forward = new THREE.Vector3()

        arrow.material = arrow.material.clone()
        arrow.material.wireframe = true

        while(input.now.audioTime.now < data.time) {
            const distance = (1 - (input.now.audioTime.now - data.time))
            camera.getWorldDirection(forward)
            const goal = forward.normalize().multiplyScalar(distance)
            arrow.position.lerp(goal, 1)//(1 - distance / startDistance) * 0.75)
            // arrow.position.copy(goal)
            arrow.lookAt(camera.position)
            arrow.rotation.copy(camera.rotation)
            arrow.rotation.z += Math.PI/2 * data.angle
            yield
        }

        arrow.material.wireframe = false
        let duration = data.duration
        let score = null
        const validDirection = ["right", "up", "left", "down"][data.angle]

        while(duration > 0) {
            if(input.now.direction[validDirection] && score === null) {
                score = duration / data.duration
                if(score > 0.9) {
                    debug.alert('PERFECT')
                    
                } else if(score > 0.8) {
                    debug.alert('GREAT')

                } else if(score > 0.6) {
                    debug.alert('GOOD')

                } else {
                    debug.alert('OK')
                    
                }
            }
            duration -= input.now.audioTime.delta
            trail.scale.z = duration
            camera.getWorldDirection(forward)
            arrow.position.copy(forward.normalize())
            arrow.lookAt(camera.position)
            arrow.rotation.z = camera.rotation.z + Math.PI/2 * data.angle
            yield
        }

        if(score == null) {
            debug.alert('MISSED')
        }

        scene.remove(arrow)
    }

    sound.play()

    for (const l of _levelData) {
        sched.add(arrowMovement(arrowObject, l))
    }
}

const onMobie = navigator.userAgent.match(/Android|iPhone/)

/**
 * annoyingly must be called from button callback on iOS, can't just be a coro
 * @returns initialized scene
 */
function initScene () {
    const renderer = new THREE.WebGLRenderer({ antialias: false })
    const camera = new THREE.PerspectiveCamera(120, window.innerWidth / window.innerHeight, 0.01, 1100)
    if(!onMobie)
        camera.position.y += 0.5
    const controls = onMobie ? new DeviceOrientationControls(camera) : new OrbitControls(camera, renderer.domElement)
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0, 0.1, 15)

    // const loader = new THREE.TextureLoader()
    // const texture = loader.load('prototype-background.png', () => {
    //     texture.magFilter = THREE.NearestFilter
    //     texture.minFilter = THREE.NearestFilter
    //     const rt = new THREE.WebGLCubeRenderTarget(texture.image.height)
    //     rt.fromEquirectangularTexture(renderer, texture)
    //     scene.background = rt
    // })

    // const helperGeometry = new THREE.BoxGeometry(100, 100, 100, 4, 4, 4)
    // const helperMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true })
    // const helper = new THREE.Mesh(helperGeometry, helperMaterial)
    // scene.add(helper)

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

function* directionIndicator(canvas) {
    const onStyle = "10px solid yellow"
    const offStyle = "10px solid black"
    
    while(true) {
        canvas.style.borderLeft = input.now.direction.left ? onStyle : offStyle
        canvas.style.borderRight = input.now.direction.right ? onStyle : offStyle
        canvas.style.borderTop = input.now.direction.up ? onStyle : offStyle
        canvas.style.borderBottom = input.now.direction.down ? onStyle : offStyle
        yield
    }
}

export function* main () {
    // wait for interaction and init scene
    const overlay = document.getElementById('overlay')
    const startButton = document.getElementById('startButton')
    let listener = null
    let renderer, camera, scene, controls
    yield* waitEvent(startButton, 'click', () => {
        listener = audio.initListener()
        const i = initScene()
        renderer = i.renderer
        camera = i.camera
        scene = i.scene
        controls = i.controls
    })
    startButton.setAttribute('disabled', true)

    gizmos.init(scene)
    
    // load audio
    audio.init(camera, listener)
    startButton.textContent = "Loading Audio..."
    const audioBuffers = yield* audio.loadSounds('sounds/coin.wav', 'audio/music/metro.mp3')
    const sound = new THREE.Audio(listener)
    sound.setBuffer(audioBuffers['audio/music/metro.mp3'])
    sound.setLoop(false)
    sound.setVolume(1)
    input.inputPipeline.push(audioTime(sound))
    input.inputPipeline.push(cameraEuler(camera))
    input.inputPipeline.push(direction)
    coro.setClock(_ => sound.context.currentTime)

    // load geometry
    startButton.textContent = "Loading Geometry..."
    const gltf = yield* waitLoadGltf('objects/relative.glb')
    // scene.add(gltf);
    const assets = collectChildren(gltf)
    const light = new THREE.AmbientLight(0x404040)
    scene.add(light)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5)
    directionalLight.position.z -= 1
    scene.add(directionalLight)
    overlay.remove()

    // create local schedule for main mechanic
    const gameSched = new coro.Schedule()

    // debug sync
    scene.background = new THREE.Color(0, 0, 0)
    const analyzer = sound.context.createAnalyser()
    analyzer.fftSize = 2048
    let bufferLength = analyzer.frequencyBinCount;
    let dataArray = new Float32Array(bufferLength);
    analyzer.getFloatTimeDomainData(dataArray);
    sound.getOutput().connect(analyzer)

    gameSched.add(function* () {
        while(true) {
            analyzer.getFloatTimeDomainData(dataArray);
            const min = Math.min(...dataArray)
            const max = Math.max(...dataArray)
            const amp = Math.min(1, Math.abs(max - min))
            scene.background.r = amp
            yield
        }
    })

    // schedule mechanic
    gameSched.add(function* () {
        yield* coro.wait(1)
        gameSched.add(beatsMechanic(gameSched, scene, camera, assets.beat, assets.beat_trail, sound, levelData))
    })

    renderer.domElement.style.boxSizing = "border-box";
    gameSched.add(directionIndicator(renderer.domElement))

    // main loop
    while (true) {
        input.update()
        gizmos.reset()
        controls.update()
        gameSched.tick()
        gizmos.draw()
        renderer.render(scene, camera)
        yield
    }
}