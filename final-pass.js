import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.124.0/build/three.module.js"
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.124.0/examples/jsm/postprocessing/ShaderPass.js';

const vertexShader = `
varying vec2 vUv;

void main() {

    vUv = uv;

    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

}
`

const fragmentShader = `
uniform sampler2D baseTexture;
uniform sampler2D bloomTexture;

varying vec2 vUv;

void main() {

    gl_FragColor = ( texture2D( baseTexture, vUv ) + vec4( 1.0 ) * texture2D( bloomTexture, vUv ) );

}
`
export function finalPass(bloomTexture) {
    const pass = new ShaderPass(
        new THREE.ShaderMaterial({
            uniforms: {
                baseTexture: { value: null },
                bloomTexture: { value: bloomTexture }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            defines: {}
        }), "baseTexture"
    );
    pass.needsSwap = true;
    return pass;
}