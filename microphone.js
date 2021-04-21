import * as coro from 'https://cdn.jsdelivr.net/gh/nasser/ajeeb-coroutines@master/build/coroutines.esm.js'
import AudioRecorder from 'https://cdn.jsdelivr.net/npm/audio-recorder-polyfill/index.js'
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
    const mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm' })
    const recordedChunks = []
    mediaRecorder.addEventListener('dataavailable', e => {
        if (e.data.size > 0)
            recordedChunks.push(e.data)
    })

    mediaRecorder.addEventListener('stop', () => saveData(name, recordedChunks))

    mediaRecorder.start()
    yield* coro.wait(length)
    mediaRecorder.stop()
}

function saveData(name, chunks) {
    const url = URL.createObjectURL(new Blob(chunks))
    const a = document.createElement("a")
    document.body.appendChild(a)
    a.style.display = 'none'
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url);
    document.body.removeChild(a)
}