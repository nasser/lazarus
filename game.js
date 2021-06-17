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
    return function audioTime(_, prev) {
        let now = audio.context.currentTime
        let delta = !prev ? 0 : now - prev.audioTime.now;
        return { now, delta }
    }
}

function highlightWall(wall, index, size) {
    const uvs = wall.geometry.attributes.uv
    const u = index/size + 1/(size*2)
    for (let i = 0; i < uvs.count; i++) {
        const v = uvs.getY(i)
        uvs.setXY( i, u, v );
    }
    uvs.needsUpdate = true
}

function gizmoCross (center) {
    gizmos.line(center, center.clone().add(new THREE.Vector3(.1, 0, 0)))
    gizmos.line(center, center.clone().add(new THREE.Vector3(-.1, 0, 0)))
    gizmos.line(center, center.clone().add(new THREE.Vector3(0, 0, .1)))
    gizmos.line(center, center.clone().add(new THREE.Vector3(0, 0, -.1)))
    gizmos.line(center, center.clone().add(new THREE.Vector3(0, .1, 0)))
    gizmos.line(center, center.clone().add(new THREE.Vector3(0, -.1, 0)))
}

function* renderCrosshair (scene, camera) {
    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3(0, 0, 0)
    const walls = scene.children.filter(o => o.name === 'wall')
    for (const wall of walls) {
        console.log(wall.geometry.boundingSphere);
    }

    // assumes camera is at origin
    while(true) {
        const forward = new THREE.Vector3()
        camera.getWorldDirection(forward)
        forward.normalize()

        for (const wall of walls) {
            highlightWall(wall, 1, 16)
        }
        raycaster.set( origin, forward );
        // raycaster.setFromCamera( new THREE.Vector2(.5,.5), camera );
        const intersects = raycaster.intersectObjects( walls );
        for (const { object } of intersects) {
            highlightWall(object, 6, 16)
        }

        forward.multiplyScalar(2)
        gizmoCross(forward)


        yield
    }
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

function drawBeatChains(beats) {
    for (let i = 0; i < beats.length-1; i++) {
        const a = beats[i]
        const b = beats[i+1]
        a.geometry.computeBoundingSphere()
        b.geometry.computeBoundingSphere()
        let aa = a.geometry.boundingSphere.center.clone()
        let bb = b.geometry.boundingSphere.center.clone()
        aa = a.localToWorld(aa)
        bb = b.localToWorld(bb)
        gizmos.line(aa, bb)
    }
}

function* beatsMechanic (sched, scene, beatObject, sound, levelData=[]) {
    const beats = []

    const startScale = 15
    const removeScale = 0.25
    const approachSpeed = 2 // unit per second
    const timeToOne = (startScale-1) / approachSpeed
    
    let angle = 0
    const levelData1 = levelData.map(({time, step}) => {
        if(step)
            angle += step * Math.PI / 8;
        return { time:time - timeToOne, angle }
    })
    const levelData2 = levelData1.map((l, i) => {
        return { ...l, delay:l.time - levelData1[i-1]?.time || l.time }
    })
    // const adjustedTimestamps = levelData.map(t => t.time - timeToZero)
    // const delays = adjustedTimestamps.map((t, i) => t - adjustedTimestamps[i-1] || t)
    const playbackDelay = levelData2[0].delay < 0 ? Math.abs(levelData2[0].delay) : 0
    console.log('[timeToZero]', timeToOne);
    console.log('[delays]', levelData2);

    function* beatMovement (beat) {
        // while(beat.scale.x > removeScale) {
        while(beat.scale.x > 1 + input.now.audioTime.delta) {
            let s = beat.scale.x - approachSpeed * input.now.audioTime.delta
            beat.scale.set(s, s, s)
            yield
        }

        beat.scale.set(1, 1, 1)
        yield* coro.wait(1)
        scene.remove(beat)
    }

    sched.add(function* () {
        yield* coro.wait(playbackDelay)
        sound.play()
    })

    // let angle = 0
    let prev = null

    for (const l of levelData2) {
        yield* coro.wait(l.delay)
        const beat = beatObject.clone()
        beat.scale.set(startScale, startScale, startScale)
        beats.push(beat)
        beat.rotation.y = l.angle
        scene.add(beat)
        sched.add(beatMovement(beat))
        prev = beat
    }
}

const onMobie = navigator.userAgent.match(/Android|iPhone/)

/**
 * annoyingly must be called from button callback on iOS, can't just be a coro
 * @returns initialized scene
 */
function initScene () {
    const renderer = new THREE.WebGLRenderer({ antialias: false })
    const camera = new THREE.PerspectiveCamera(120, window.innerWidth / window.innerHeight, 0.1, 1100)
    if(!onMobie)
        camera.position.y += 0.5
    const controls = onMobie ? new DeviceOrientationControls(camera) : new OrbitControls(camera, renderer.domElement)
    const scene = new THREE.Scene()

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
    const audioBuffers = yield* audio.loadSounds('sounds/coin.wav', 'audio/music/bpm73.mp3')
    const sound = new THREE.Audio(listener)
    sound.setBuffer(audioBuffers['audio/music/bpm73.mp3'])
    sound.setLoop(false)
    sound.setVolume(1)
    input.inputPipeline.push(audioTime(sound)) // ???

    // load geometry
    startButton.textContent = "Loading Geometry..."
    const gltf = yield* waitLoadGltf('objects/ring2.glb')
    const assets = collectChildren(gltf)
    scene.add(assets.ring.clone())
    scene.add(assets.bounds.clone())
    for (let i = 0; i < 8; i++) {
        const w = assets.wall.clone()
        w.geometry = assets.wall.geometry.clone()
        console.log();
        if(i == 3) {
            const uvs = w.geometry.attributes.uv
            for (let j = 0; j < uvs.count; j++) {
                var u = uvs.getX(i)
                var v = uvs.getY(i)
                u += 1/32
                uvs.setXY( j, u, v );
            }
        }
        w.geometry.computeBoundingBox()
        w.geometry.computeBoundingSphere()
        w.rotation.y = Math.PI/4 * i
        scene.add(w)
    }
    const light = new THREE.AmbientLight(0x404040)
    scene.add(light)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5)
    directionalLight.position.z -= 1
    scene.add(directionalLight)
    overlay.remove()

    // create local schedule for main mechanic
    const gameSched = new coro.Schedule()

    // schedule mechanic
    gameSched.add(function* () {
        yield* coro.wait(1)
        gameSched.add(beatsMechanic(gameSched, scene, assets.beat, sound, levelData))
    })

    gameSched.add(renderCrosshair(scene, camera))
    
    // main loop
    while (true) {
        input.update()
        gizmos.reset()
        controls.update()
        // renderCrosshair(camera)
        gameSched.tick()
        gizmos.draw()
        renderer.render(scene, camera)
        yield
    }
}