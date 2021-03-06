/**
 * Recursively freeze an object
 * 
 * @from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
 * @param object object to freeze
 */
function deepFreeze(object) {
    const propNames = Object.getOwnPropertyNames(object);
    for (const name of propNames) {
        const value = object[name];
        if (value && typeof value === "object") {
            deepFreeze(value);
        }
    }
    return Object.freeze(object);
}

/**
 * The input system
 * 
 * Initialized with an *input pipeline*, an array of functions that compute and
 * return input values.
 * 
 * Exposes a `now` and `last` property representing the inputs captured "this
 * frame" and "last frame". Each is an object with properties that match the
 * names of the functions in the input pipeline.
 * 
 * `now` and `last` are updated when `update` is called (ideally, once a frame
 * before any application logic has run). See `update` documentation for
 * details. `now` and `last` are frozen and cannot be modified.
 * 
 * @example 
 * let input = new Input([
 *   function time() { ... },
 *   function keyboard() { ... },
 *   function mouse() { ... }
 * ])
 * 
 * input.update()
 * input.now.time // value returned by time function
 * input.now.keyboard // value returned by keyboard function
 * input.now.mouse // value returned by mouse function
 * 
 * input.update()
 * input.now.time // value returned by time function
 * input.last.time // value returned by time function in the first update
 */
export class Input {
    /**
     * @param {function[]} inputPipeline array of functions that generate input
     * values every frame
     */
    constructor(inputPipeline) {
        for (const f of inputPipeline)
            if (f.name == "") throw new Error("All input functions must have names")

        this.inputPipeline = inputPipeline
        this.last = null
        this.now = null
    }

    /**
     * Gather inputs and update `now` and `last`.
     * 
     * Sets `last` to `now` and computes a new value for `now` by calling every
     * function in the input pipeline in turn. The values returned are
     * associated with the functions' names in `now`.
     * 
     * Input functions are called by passing in the new value for `now` as the
     * first argument and the last frame's input as the second argument. These
     * arguments can be ignored if they are not useful.
     * 
     * Should be called once a frame before any application logic.
     * 
     * @example
     * // previous value can be used to compute deltas
     * let input = new Input([
     *   function time(_now, previous) { 
     *     let now = performance.now()
     *     let delta = !previous ? 0 : now - previous.time.now;
     *     return { now, delta }
     *   }
     * ])
     * 
     * // now value can be used to process values from earlier in the pipeline
     * let input = new Input([
     *   function rawData() { ... }
     *   function smoothData(now) { 
     *     return smoothFunction(now.rawData)
     *   }
     * ])
     */
    update() {
        let _now = {}
        for (const f of this.inputPipeline) {
            _now[f.name] = f(_now, this.now)
        }
        this.last = this.now
        this.now = deepFreeze(_now)
    }
}

/**
 * Construct new input system
 * 
 * Convenience variadic factory function
 * 
 * @param  {...function} inputFunctions 
 * input functions. they must all have names.
 */
export function init(...inputFunctions) {
    return new Input(inputFunctions)
}

/**
 * Time input
 * 
 * @returns { { now:number, delta:number, frame:number } }
 * now: the current time in seconds
 * delta: the number of seconds since the last frame
 * frame: the number frame number
 */
export function time(_thisFrame, prevFrame) {
    let now = performance.now() / 1000
    let delta = !prevFrame ? 0 : now - prevFrame.time.now;
    let frame = !prevFrame ? 0 : prevFrame.time.frame + 1
    return { now, delta, frame }
}