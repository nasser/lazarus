import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.124.0/build/three.module.js"

export let gizmoObject

export const colors = {
    red: new THREE.Color(1, 0, 0, 1),
    green: new THREE.Color(0, 1, 0, 1),
    blue: new THREE.Color(0, 0, 1, 1),
    white: new THREE.Color(1, 1, 1, 1),
    clear: new THREE.Color(1, 1, 1, 0)
}

export function init (scene, options) {
    options = options || {}
    const material = new THREE.LineBasicMaterial({
        color: 0xffffff,
        vertexColors: THREE.VertexColors
    })
  
    const vertCount = options.size || 2000
  
    const geometry = new THREE.Geometry()
    for (let i = 0; i < vertCount; i++) {
        geometry.vertices.push(new THREE.Vector3(0, 0, 0))
        geometry.colors.push(colors.white)
    }
    
    gizmoObject = new THREE.LineSegments(geometry, material)
    scene.add(gizmoObject)
}

export function reset () {
    gizmoObject.geometry.vertices.length = 0 // TODO ???
    gizmoObject.geometry.colors.length = 0 // TODO ???
}

export function draw () {
    gizmoObject.geometry.colorsNeedUpdate = true
    gizmoObject.geometry.verticesNeedUpdate = true
    gizmoObject.geometry.computeBoundingSphere()
}

export function line (a, b, color) {
    // if(index >= gizmoObject.geometry.vertices.length)
    //   return;
    color = color || colors.white
    // gizmoObject.geometry.vertices[index] = a
    // gizmoObject.geometry.colors[index] = color
    gizmoObject.geometry.vertices.push(a)
    gizmoObject.geometry.colors.push(color)
    // gizmoObject.geometry.vertices[index] = b
    // gizmoObject.geometry.colors[index] = color
    gizmoObject.geometry.vertices.push(b)
    gizmoObject.geometry.colors.push(color)
}
