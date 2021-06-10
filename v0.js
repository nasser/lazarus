import * as coro from 'https://cdn.jsdelivr.net/gh/nasser/ajeeb-coroutines@master/build/coroutines.esm.js'
import * as debug from './debug.js'
import { main } from './game.js'

const sched = new coro.Schedule()

sched.add(main)

debug.init()
debug.logUncaughtErrors()

function tick () {
    requestAnimationFrame(tick)
    sched.tick()
}
tick()
