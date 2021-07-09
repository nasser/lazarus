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

const threshold = 0.1
function direction(input) {
    const right = input.cameraEuler.delta.y < -threshold
    const left = input.cameraEuler.delta.y >= threshold
    const down = input.cameraEuler.delta.x < -threshold
    const up = input.cameraEuler.delta.x >= threshold
    return { left, right, up, down }
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

function* beatsMechanic (sched, scene, camera, arrowObject, sound, levelData=[]) {
    const startDistance = 15
    const approachSpeed = 2 // unit per second
    const timeToOne = (startDistance-1) / approachSpeed
    
    let a = 0

    const levelData1 = levelData.map(({time, angle}) => {
        a += Math.floor(Math.random() * 8)
        return { time:time - timeToOne, angle:a }
    })
    const levelData2 = levelData1.map((l, i) => {
        return { ...l, delay:l.time - levelData1[i-1]?.time || l.time }
    })
    const playbackDelay = levelData2[0].delay < 0 ? Math.abs(levelData2[0].delay) : 0
    console.log('[levelData2[0].delay < 0]', levelData2[0].delay < 0, levelData2[0].delay );
    console.log('[playbackDelay]', playbackDelay);
    console.log('[timeToOne]', timeToOne);
    console.log('[delays]', levelData2);

    function* arrowMovement (arrow, angle) {
        scene.add(arrow)
        const forward = new THREE.Vector3()
        let distance = startDistance;

        camera.getWorldDirection(forward)
        arrow.position.copy(forward.normalize().multiplyScalar(startDistance))
        arrow.material = arrow.material.clone()
        arrow.material.wireframe = true
        
        while(distance > 1 + input.now.audioTime.delta) {
            // TODO camera forward could be in input
            camera.getWorldDirection(forward)
            const goal = forward.normalize().multiplyScalar(distance)
            arrow.position.lerp(goal, 1)//(1 - distance / startDistance) * 0.75)
            // arrow.position.copy(goal)
            arrow.lookAt(camera.position)
            // arrow.rotation.z = camera.rotation.z + Math.PI/2 * angle
            arrow.rotation.copy(camera.rotation)
            arrow.rotation.z += Math.PI/2 * angle
            distance -= input.now.audioTime.delta * approachSpeed
            yield
        }

        arrow.material.wireframe = false

        yield* coro.waitFirst(
            [coro.wait(0.25),
             function* () {
                while(true) {
                    camera.getWorldDirection(forward)
                    arrow.position.copy(forward.normalize())
                    arrow.lookAt(camera.position)
                    arrow.rotation.z = camera.rotation.z + Math.PI/2 * angle
                    yield
                }
             }])
        scene.remove(arrow)
    }

    sched.add(function* () {
        yield* coro.wait(playbackDelay)
        sound.play()
    })

    for (const l of levelData2) {
        yield* coro.wait(l.delay)
        const arrow = arrowObject.clone()
        sched.add(arrowMovement(arrow, l.angle))
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

    // schedule mechanic
    gameSched.add(function* () {
        yield* coro.wait(1)
        gameSched.add(beatsMechanic(gameSched, scene, camera, assets.arrow, sound, levelData))
    })

    // gameSched.add(renderCrosshair(scene, camera))
    
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