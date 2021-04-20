import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.124.0/build/three.module.js"
import * as coro from 'https://cdn.jsdelivr.net/gh/nasser/ajeeb-coroutines@master/build/coroutines.esm.js'

let sound
let buffers = {}

/**
 * call this from a user-interaction to make iOS happy
 */
export function initListener() {
    const listener = new THREE.AudioListener();
    const source = listener.context.createBufferSource();
    source.connect(listener.context.destination);
    source.start();
    return listener
}

export function init(camera, listener) {
    camera.add(listener);
    sound = new THREE.Audio(listener);
    sound.setLoop(false);
    sound.setVolume(0.5);
}

export function* loadSounds(...urls) {
    let bufferStartSize = Object.keys(buffers).length
    const audioLoader = new THREE.AudioLoader();
    for (const url of urls) {
         audioLoader.load(url, buffer => buffers[url] = buffer)
    }
    while(Object.keys(buffers).length < bufferStartSize + urls.length) yield
    return buffers
    
}

export function play(name) {
    if(buffers[name]) {
        sound.setBuffer(buffers[name]);
        sound.play();
    }
}