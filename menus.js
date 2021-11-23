import * as coro from 'https://cdn.jsdelivr.net/gh/nasser/ajeeb-coroutines@master/build/coroutines.esm.js'
import { waitEvent, hide, gone, here, show } from './common.js'

const overlay = document.querySelector('#overlay')
const difficulty = document.querySelector('#difficulty')
const end = document.querySelector('#end')
const normalButton = document.querySelector('button.normal')
const hardButton = document.querySelector('button.hard')
const nextButton = document.querySelector('button.next')

export function* mainMenu() {
    hide(overlay)
    gone(overlay)
    here(difficulty)
    yield
    show(difficulty)
    let button = yield* coro.waitFirst([waitEvent(normalButton, 'click'), waitEvent(hardButton, 'click')])
    let choice = button.getAttribute('class')
    hide(difficulty)
    yield* coro.wait(0.5)
    gone(difficulty)
    here(overlay)
    yield
    show(overlay)
    return choice
}

export function* endMenu () {
    here(end)
    yield
    show(end)
    yield* waitEvent(nextButton, 'click')
    hide(end)
    yield* coro.wait(0.5)
    gone(end)
}