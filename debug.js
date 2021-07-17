let logElement
let alertElement

export function init () {
    logElement = document.createElement("div")
    logElement.id = "debug"
    document.body.appendChild(logElement)
    alertElement = document.createElement("div")
    alertElement.id = "alert"
    document.body.appendChild(alertElement)
}

export function log (...args) {
    console.log(...args)
    const message = args.join(" ")
    const code = document.createElement("code")
    code.textContent = message
    logElement.appendChild(code)
}

export function logUncaughtErrors () {
    window.onerror = function (message, source, lineno, colno, error) {
        log(message)
        for (const line of error.stack.split("\n")) {
            log(line)
        }
    }    
}

export function alert(...args) {
    const message = args.join(" ")
    alertElement.textContent = message
    alertElement.classList.add('changed')
    setTimeout(_ => alertElement.classList.remove('changed'), 10)
}

window.aalert = alert