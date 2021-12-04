// SCENE
const scene = new THREE.Scene();

// CAMERA
const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight,0.1,1000);
camera.position.set(50,20,-10);

// RENDERER
var renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setPixelRatio(window.devicePixelRatio);
// Append canvas to the body
document.body.appendChild( renderer.domElement);

// CONTROLS
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.autoRotate = true;
controls.autoRotateSpeed = 4;
controls.maxDistance = 75;
controls.minDistance = 0;
controls.enablePan = false;

// LIGHTING
const light = new THREE.PointLight(0xffffff, 1, 200);
light.position.set(50, 50, 50);
scene.add(light);

const light1 = new THREE.PointLight(0xaaaaaa, 1, 20);
light1.position.set(0, .4, 1);
scene.add(light1);

const light2 = new THREE.AmbientLight(0x404040);
scene.add(light2);

// GLTF Loader to Load and manipulate 3D Models
const loader = new THREE.GLTFLoader();
loader.load("https://subnetpie.github.io/threejs/bosco.glb", function (data) {
  var model = data.scene;
  model.position.set(0, 0, 0);
  model.scale.set(0.5, 0.5, 0.5);
  scene.add(model);
});

// Render animation on every rendering phase
function render() {  
  requestAnimationFrame(render);
  renderer.render(scene, camera); // Render Scene and Camera
  controls.update(); // For Orbit Control
}

render();

// WINDOW RESIZE
window.addEventListener("resize", function() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}, false);
