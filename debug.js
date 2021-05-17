let element

export function init () {
    element = document.createElement("div")
    element.id = "debug"
    document.body.appendChild(element)
}

export function log (...args) {
    console.log(...args)
    const message = args.join(" ")
    const code = document.createElement("code")
    code.textContent = message
    element.appendChild(code)
}

export function logUncaughtErrors () {
    window.onerror = function (message, source, lineno, colno, error) {
        log(message)
        for (const line of error.stack.split("\n")) {
            log(line)
        }
    }    
}
