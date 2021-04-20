let element

export function init() {
    element = document.createElement("div")
    element.id = "debug"
    document.body.appendChild(element)
}

export function log(...args) {
    console.log(...args)
    const message = args.join(" ")
    const code = document.createElement("code")
    code.textContent = message
    element.appendChild(code)
}