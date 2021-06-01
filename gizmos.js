import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.124.0/build/three.module.js"

export let gizmoObject
let index = 0
let vertsAttribute = null
let colorsAttribute = null

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
  
    const geometry = new THREE.BufferGeometry()
    const vertices = Float32Array.from(Array(vertCount*3).fill(0))
    const colors = Float32Array.from(Array(vertCount*4).fill(1))
    geometry.setAttribute('position', new THREE.BufferAttribute( vertices, 3 ) );
    geometry.setAttribute('color', new THREE.BufferAttribute( colors, 4 ) );
    vertsAttribute = geometry.getAttribute('position')
    colorsAttribute = geometry.getAttribute('color')
    
    gizmoObject = new THREE.LineSegments(geometry, material)
    gizmoObject.userData.size = vertCount
    scene.add(gizmoObject)
}

export function reset () {
    index = 0
}

export function draw () {
    vertsAttribute.needsUpdate = true
    vertsAttribute.updateRange.count = index * 3
    colorsAttribute.needsUpdate = true
    colorsAttribute.updateRange.count = index * 4
    gizmoObject.geometry.setDrawRange(0, index)
    gizmoObject.geometry.computeBoundingSphere()
}

export function line (a, b, color) {
    if(index >= gizmoObject.userData.size)
      return;
    color = color || colors.white
    vertsAttribute.setXYZ(index  , a.x, a.y, a.z)
    vertsAttribute.setXYZ(index+1, b.x, b.y, b.z)
    colorsAttribute.setXYZW(index  , color.r, color.g, color.b, color.a)
    colorsAttribute.setXYZW(index+1, color.r, color.g, color.b, color.a)
    index += 2
}
