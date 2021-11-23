import * as coro from 'https://cdn.jsdelivr.net/gh/nasser/ajeeb-coroutines@master/build/coroutines.esm.js'
import * as debug from './debug.js'
import { main } from './game.js'
import { mainMenu, endMenu } from './menus.js'

const sched = new coro.Schedule()

sched.add(function* () {
    let difficulty = yield* mainMenu()
    yield* main(difficulty)
    yield* endMenu()
    location.reload()
})

debug.init()
debug.logUncaughtErrors()

function tick () {
    requestAnimationFrame(tick)
    sched.tick()
}
tick()
