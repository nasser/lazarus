import * as coro from 'https://cdn.jsdelivr.net/gh/nasser/ajeeb-coroutines@master/build/coroutines.esm.js'
import AudioRecorder from 'https://cdn.jsdelivr.net/npm/audio-recorder-polyfill@0.4.1/index.js'
if(!window.MediaRecorder) {
    window.MediaRecorder = AudioRecorder
}

let mediaStream = null

export function* init() {
    let done = false
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {mediaStream = stream; done = true})
    while(!done) yield
}


export function* recordAndDownload(name='recording.wav', length=5) {
    const mimeType = 'audio/webm'
    const mediaRecorder = new MediaRecorder(mediaStream)
    const recordedChunks = []
    mediaRecorder.addEventListener('dataavailable', e => {
        if (e.data.size > 0)
            recordedChunks.push(e.data)
    })

    let blob = null
    mediaRecorder.addEventListener('stop', () => blob = new Blob(recordedChunks, { type:mimeType }))

    mediaRecorder.start()
    yield* coro.wait(length)
    mediaRecorder.stop()
    while(!blob) yield
    return blob
}