export function* waitEvent (element, event, cb) {
    let done = false
    const f = (...args) => {
        done = true
        if(cb) cb(...args)
    }
    element.addEventListener(event, f)
    while (!done) yield
    element.removeEventListener(event, f)
    return element
}

export const hide = e => e.classList.add('hidden')
export const show = e => e.classList.remove('hidden')
export const gone = e => e.classList.add('gone')
export const here = e => e.classList.remove('gone')
