import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.124.0/build/three.module.js"
import { DeviceOrientationControls } from 'https://cdn.jsdelivr.net/npm/three@0.124.0/examples/jsm/controls/DeviceOrientationControls.js'
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.124.0/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.124.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.124.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.124.0/examples/jsm/postprocessing/UnrealBloomPass.js';

import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.124.0/examples/jsm/loaders/GLTFLoader.js'
import * as coro from 'https://cdn.jsdelivr.net/gh/nasser/ajeeb-coroutines@master/build/coroutines.esm.js'
import * as debug from './debug.js'
import * as gizmos from './gizmos.js'
import * as audio from './audio.js'
import { Input, time } from './input.js'
import { finalPass } from './final-pass.js'

const gltfLoader = new GLTFLoader()

function* waitFetch(url) {
    let result = null
    fetch(url)
        .then(response => response.text())
        .then(text => result = text)
    
    while(!result) yield
    return result
}

function randomDirection() {
    return ["up", "down", "left", "right"][Math.floor(Math.random() * 4)]
}

function parseLevelData(text) {
    return text.trim()
                .split("\n")
                .map(line => line.trim().split("\t"))
                .map(([from, to, direction]) => {
                    direction = direction == "x" ? randomDirection() : direction;
                    if(from === to)
                        return { type: "beat", time: parseFloat(from), direction }
                    return { type: "sustain", from: parseFloat(from), to:parseFloat(to), direction }
                })
}

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
        playhead = audio.currentTime
        // if(!playing && audio.isPlaying) {
        //     startTime = audio.currentTime
        // } else if(playing && !audio.isPlaying) {
        //     accumulated = playhead
        // }
        // playing = audio.isPlaying;
        // if(playing)
        //     playhead = accumulated + audio.currentTime - startTime
        
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

const lerp = (x, y, a) => x * (1 - a) + y * a
const invlerp = (x, y, a) => clamp((a - x) / (y - x))
const clamp = (a, min = 0, max = 1) => Math.min(max, Math.max(min, a))
const range = ( in_min, in_max, out_min, out_max, toLerp ) => clamp(lerp(out_min, out_max, invlerp(in_min, in_max, toLerp)), out_min, out_max)
 
function* beatsMechanic (scene, camera, assets, sound, levelData) {
    let totalScore = 0
    const directionToAngle = { right:0, up:1, left:2, down:3 }
    assets.judge.material.size = 4
    const targets = []

    debug.alert('3')
    yield* coro.wait(1)
    debug.alert('2')
    yield* coro.wait(1)
    debug.alert('1')
    yield* coro.wait(1)
    debug.alert('GO')    
    
    for (let i = 0; i < 4; i++) {
        const target = assets.judge.clone()
        targets.push(target)
        scene.add(target)
    }

    function* positionTargets() {
        while(true) {
            for (let i = 0; i < 4; i++) {
                const target = targets[i]
                // target.rotation.x = Math.PI/2
                // target.rotation.z = Math.PI/2 * i
                camera.getWorldDirection(target.position)
                target.position.normalize()
                target.lookAt(camera.position)
                target.rotation.copy(camera.rotation)
                target.rotation.z += Math.PI/2 * i
            }
            yield
        }
    }
    
    function* single (mainGeo, trailGeo, start, duration, direction, scoring) {
        const arrow = mainGeo.clone()
        const trail = trailGeo.clone()
        trail.scale.z = duration
        scene.add(arrow)
        arrow.add(trail)
        const forward = new THREE.Vector3()
        camera.getWorldDirection(forward)
        const angle = Math.PI / 2 * directionToAngle[direction]
        
        arrow.material = arrow.material.clone()
        arrow.material.wireframe = true
        arrow.material.transparent = true
        trail.material = trail.material.clone()
        trail.material.transparent = true
        arrow.position.copy(forward.normalize().multiplyScalar(50))

        while(input.now.audioTime.now < start) {
            const distance = (1 - (input.now.audioTime.now - start))
            camera.getWorldDirection(forward)
            const goal = forward.normalize().multiplyScalar(distance)
            const tt = Math.pow(range(15, 0, 0.225, 1, distance), 2)
            const uu = Math.pow(range(15, 0, 0, 1, distance), 2)
            // fog distance
            if(distance > 15)
                arrow.position.copy(goal)
            else
                arrow.position.lerp(goal, tt)
            arrow.material.opacity = uu
            trail.material.opacity = uu
            arrow.lookAt(camera.position)
            arrow.rotation.copy(camera.rotation)
            arrow.rotation.z += angle
            yield
        }

        arrow.material.wireframe = false
        const validDirection = direction.toLowerCase()
        const originalDuration = duration
        let score = null

        while(duration > 0) {
            if(!score)
                score = scoring(validDirection, duration, originalDuration)

            duration -= input.now.audioTime.delta
            trail.scale.z = duration
            camera.getWorldDirection(forward)
            arrow.position.copy(forward.normalize())
            arrow.lookAt(camera.position)
            arrow.rotation.copy(camera.rotation)
            arrow.rotation.z += angle
            yield
        }

        if(!score)
            score = scoring(validDirection, 0, originalDuration)

        if(!score) {
            debug.alert('MISSED')
        } else {
            totalScore += score
        }

        scene.remove(arrow)
    }

    function accuracyToScore(accuracy) {
        if(accuracy > 0.9) {
            debug.alert('PERFECT')
            return 1
            
        } else if(accuracy > 0.8) {
            debug.alert('GREAT')
            return 0.8

        } else if(accuracy > 0.6) {
            debug.alert('GOOD')
            return 0.6

        } else {
            debug.alert('OK')
            return 0.5
            
        }

    }

    function scoringBeat(direction, duration, originalDuration) {
        if(input.now.direction[direction]) {
            return accuracyToScore(duration / originalDuration)

        }
    }

    function scoringSustain() {
        let totalFrames = 0
        let goodFrames = 0
        return function(direction, duration, originalDuration) {
            if(duration === 0) {
                return accuracyToScore(goodFrames / totalFrames)

            } else {
                totalFrames += 1
                if(input.now.direction[direction]) {
                    goodFrames += 1
                }
            }

        }
    }
        

    function element(l) {
        if(l.type === "beat")
            return single(assets.beat, assets.beat_trail, l.time, .25, l.direction, scoringBeat)
        else if(l.type === "sustain")
            return single(assets.sustain, assets.sustain_trail, l.from, l.to - l.from, l.direction, scoringSustain())
    }

    sound.play()

    yield* coro.waitFirst([positionTargets(), coro.waitAll(levelData.map(element))])

    const final = totalScore / levelData.length * 100
    let finalLabel
    if(final > 0.9) {
        finalLabel = 'EXCELLENT'
    } else if(final > 0.8) {
        finalLabel = 'AMAZING'
    } else if(final > 0.6) {
        finalLabel = 'PRETTY GOOD'
    } else {
        finalLabel = 'KEEP PRACTICING'
    }

    yield* coro.waitFirst([
        positionTargets(),
        function* () {
            while(true) {
                debug.alert(`${final.toFixed(2)}% -- ${finalLabel}`)
                yield* coro.wait(1)
                yield
            }
        }
    ])
}

const onMobie = navigator.userAgent.match(/Android|iPhone/)

/**
 * annoyingly must be called from button callback on iOS, can't just be a coro
 * @returns initialized scene
 */
function initScene () {
    const renderer = new THREE.WebGLRenderer({ alpha:false })
    const camera = new THREE.PerspectiveCamera(120, window.innerWidth / window.innerHeight, 0.01, 1100)
    if(!onMobie)
        camera.position.y += 0.5
    const controls = onMobie ? new DeviceOrientationControls(camera) : new OrbitControls(camera, renderer.domElement)
    const scene = new THREE.Scene()
    const bgscene = new THREE.Scene()
    scene.background = null
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setClearColor(0xff0000, 0)
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = Math.pow( 1.5, 4 ); // 1.5 might be too much
    document.body.appendChild(renderer.domElement)

    window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()
        renderer.setSize(window.innerWidth, window.innerHeight)
    })

    const bgRenderPass = new RenderPass(bgscene, camera);

    const renderPass = new RenderPass(scene, camera);

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0;
    bloomPass.strength = 5;
    bloomPass.radius = 0.25;

    const bloomComposer = new EffectComposer( renderer );
    bloomComposer.renderToScreen = false;
    bloomComposer.addPass( renderPass );
    bloomComposer.addPass(bloomPass);

    const finalComposer = new EffectComposer(renderer);
    finalComposer.addPass( bgRenderPass );
    finalComposer.addPass( finalPass(bloomComposer.renderTarget2.texture) );

    return { renderer, bloomComposer, finalComposer, scene, bgscene, camera, controls }
}

function* directionIndicator(canvas) {
    const onStyle = "10px solid yellow"
    const offStyle = "10px solid black"
    
    while (true) {
        input.now.direction.left ? canvas.classList.add("indicate-left") : canvas.classList.remove("indicate-left")
        input.now.direction.right ? canvas.classList.add("indicate-right") : canvas.classList.remove("indicate-right")
        input.now.direction.up ? canvas.classList.add("indicate-top") : canvas.classList.remove("indicate-top")
        input.now.direction.down ? canvas.classList.add("indicate-bottom") : canvas.classList.remove("indicate-bottom")
        // canvas.style.borderLeft = input.now.direction.left ? onStyle : offStyle
        // canvas.style.borderRight = input.now.direction.right ? onStyle : offStyle
        // canvas.style.borderTop = input.now.direction.up ? onStyle : offStyle
        // canvas.style.borderBottom = input.now.direction.down ? onStyle : offStyle
        yield
    }
}

export function* main () {
    // wait for interaction and init scene
    const overlay = document.getElementById('overlay')
    const startButton = document.getElementById('startButton')
    let audioBuffers = null
    let renderer, bloomComposer, finalComposer, camera, scene, bgscene, controls
    yield* waitEvent(startButton, 'click', () => {
        if(onMobie && document.body.requestFullscreen)
            document.body.requestFullscreen()
        // listener = audio.initListener()
        const i = initScene()
        renderer = i.renderer
        camera = i.camera
        scene = i.scene
        bgscene = i.bgscene
        controls = i.controls
        bloomComposer = i.bloomComposer
        finalComposer = i.finalComposer
        audioBuffers = audio.loadSounds('audio/music/mario.mp3')
    })
    startButton.setAttribute('disabled', true)

    gizmos.init(scene)
    
    // load audio
    // audio.init(camera, listener)
    startButton.textContent = "Loading Audio..."
    yield* audio.waitUntilAudioCanPlay();
    const sound = audioBuffers['audio/music/mario.mp3']
    input.inputPipeline.push(audioTime(sound))
    input.inputPipeline.push(cameraEuler(camera))
    input.inputPipeline.push(direction)
    // coro.setClock(_ => sound.currentTime)

    // load geometry
    startButton.textContent = "Loading Geometry..."
    const gltf = yield* waitLoadGltf('objects/relative.glb')
    // scene.add(gltf);
    const assets = collectChildren(gltf)
    const background = assets.background.clone()
    bgscene.add(background)
    background.rotation.y = Math.PI*2
    background.rotation.x = Math.PI*2
    const light = new THREE.AmbientLight(0x404040)
    scene.add(light)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5)
    directionalLight.position.z -= 1
    scene.add(directionalLight)
    overlay.remove()

    // create local schedule for main mechanic
    const gameSched = new coro.Schedule()

    function* drift(scene, asset, i, x, y, z) {
        const obj = asset.clone()
        obj.scale.set(i*.25, i*.25, i*.25)
        obj.material.transparent = true
        obj.material.blending = THREE.AdditiveBlending
        obj.material.opacity = .125*i
        obj.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI)
        scene.add(obj)
        while (true) {
            obj.rotation.x += 0.001 * x
            obj.rotation.y += 0.001 * y
            obj.rotation.z += 0.001 * z
            yield
        }
    }

    gameSched.add(drift(bgscene, assets.clouds, .08, 1, -2, 1))
    gameSched.add(drift(bgscene, assets.clouds, 1, 1, -2, 1))
    gameSched.add(drift(bgscene, assets.clouds, 2, 2, 1, -1))
    gameSched.add(drift(bgscene, assets.clouds, 3, -1, -1, 2))
    bgscene.background = new THREE.Color(0, 0, 0)
    
    // debug sync
    // const analyzer = sound.context.createAnalyser()
    // analyzer.fftSize = 2048
    // let bufferLength = analyzer.frequencyBinCount;
    // let dataArray = new Float32Array(bufferLength);
    // analyzer.getFloatTimeDomainData(dataArray);
    // sound.getOutput().connect(analyzer)

    // gameSched.add(function* () {
    //     while(true) {
    //         analyzer.getFloatTimeDomainData(dataArray);
    //         const min = Math.min(...dataArray)
    //         const max = Math.max(...dataArray)
    //         const amp = Math.min(1, Math.abs(max - min))
    //         scene.background.r = amp
    //         yield
    //     }
    // })

    const levelData = parseLevelData(yield* waitFetch("mario.txt"))

    // schedule mechanic
    gameSched.add(function* () {
        yield* coro.wait(1)
        gameSched.add(beatsMechanic(scene, camera, assets, sound, levelData))
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
        bloomComposer.render();
        finalComposer.render();
        yield
    }
}