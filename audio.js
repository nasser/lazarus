import * as coro from 'https://cdn.jsdelivr.net/gh/nasser/ajeeb-coroutines@master/build/coroutines.esm.js'

let buffers = {}

export function loadSounds(...urls) {
    for (const url of urls) {
        const audio = new Audio();
        audio.src = url
        audio.load()
        audio.oncanplaythrough = _ => audio.loaded = true
        buffers[url] = audio
    }
    return buffers
}

/**
 * moved this out of loadSounds to keep iOS happy...
 */
export function* waitUntilAudioCanPlay() {
    yield* coro.waitAll(Object.values(buffers).map(function* (b) {
        while(!b.loaded)
            yield
    }))
}